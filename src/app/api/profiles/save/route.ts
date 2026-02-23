import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

const AGENTS_ROOT = path.join(os.homedir(), ".openclaw", "agents");

function safeProfilesPath(agentId: string): string | null {
  if (!/^[a-z0-9_-]+$/.test(agentId)) return null;
  const p = path.join(AGENTS_ROOT, agentId, "agent", "auth-profiles.json");
  if (!p.startsWith(AGENTS_ROOT + path.sep)) return null;
  return p;
}

async function atomicWrite(filePath: string, data: unknown) {
  const tmp = filePath + ".divan-save.tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, filePath);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agentId, profileId, isNew, provider, type, credential } = body as {
    agentId: string;
    profileId: string;
    isNew: boolean;
    provider: string;
    type: string;
    credential?: string;
  };

  if (!agentId || !profileId || !provider || !type) {
    return NextResponse.json({ error: "agentId, profileId, provider and type are required" }, { status: 400 });
  }

  if (!["token", "api_key"].includes(type)) {
    return NextResponse.json({ error: "Only token and api_key types can be created or edited" }, { status: 400 });
  }

  const profilesPath = safeProfilesPath(agentId);
  if (!profilesPath) {
    return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
  }

  // Validate profileId format: <provider>:<suffix>
  if (!/^[a-z0-9_-]+:[a-z0-9_.@-]+$/.test(profileId)) {
    return NextResponse.json(
      { error: "Profile ID must match pattern <provider>:<suffix>, e.g. anthropic:work" },
      { status: 400 }
    );
  }

  let fileData: Record<string, unknown>;
  try {
    const raw = await fs.readFile(profilesPath, "utf-8");
    fileData = JSON.parse(raw);
  } catch {
    // File doesn't exist yet — start fresh
    fileData = { version: 1, profiles: {}, lastGood: {}, usageStats: {} };
  }

  const profiles = (fileData.profiles as Record<string, unknown>) || {};

  if (isNew && profiles[profileId]) {
    return NextResponse.json({ error: "Profile ID already exists" }, { status: 409 });
  }

  if (!isNew && !profiles[profileId]) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const existing = (profiles[profileId] as Record<string, unknown>) || {};

  // Build the new profile entry
  const newEntry: Record<string, unknown> = {
    ...existing,
    type,
    provider,
  };

  // Apply credential only if provided (empty string = keep existing)
  if (credential && credential.trim()) {
    if (type === "token") {
      newEntry.token = credential.trim();
    } else if (type === "api_key") {
      newEntry.key = credential.trim();
    }
  } else if (isNew) {
    return NextResponse.json({ error: "Credential is required for new profiles" }, { status: 400 });
  }

  profiles[profileId] = newEntry;
  fileData.profiles = profiles;

  try {
    await atomicWrite(profilesPath, fileData);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
