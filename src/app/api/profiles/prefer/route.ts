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

export async function POST(request: NextRequest) {
  let body: { agentId?: string; provider?: string; profileId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agentId, provider, profileId } = body;

  if (!agentId || !provider || !profileId) {
    return NextResponse.json(
      { error: "agentId, provider and profileId are required" },
      { status: 400 }
    );
  }

  const profilesPath = safeProfilesPath(agentId);
  if (!profilesPath) {
    return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
  }

  try {
    const raw = await fs.readFile(profilesPath, "utf-8");
    const data = JSON.parse(raw);

    if (!data.profiles?.[profileId]) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (!data.lastGood) data.lastGood = {};
    data.lastGood[provider] = profileId;

    const tmp = profilesPath + ".divan-prefer.tmp";
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmp, profilesPath);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
