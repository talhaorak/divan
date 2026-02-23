import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function POST(request: NextRequest) {
  let body: { agentId?: string; profileId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentId, profileId } = body;

  if (!agentId || !profileId || typeof agentId !== "string" || typeof profileId !== "string") {
    return NextResponse.json({ error: "agentId and profileId are required" }, { status: 400 });
  }

  // Validate agentId to prevent path traversal (only lowercase alphanumeric, hyphens, underscores)
  if (!/^[a-z0-9_-]+$/.test(agentId)) {
    return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
  }

  const agentsRoot = path.join(os.homedir(), ".openclaw", "agents");
  const profilesPath = path.join(agentsRoot, agentId, "agent", "auth-profiles.json");

  // Double-check resolved path is within agentsRoot
  if (!profilesPath.startsWith(agentsRoot + path.sep)) {
    return NextResponse.json({ error: "Unauthorized path" }, { status: 403 });
  }

  try {
    const raw = await fs.readFile(profilesPath, "utf-8");
    const data = JSON.parse(raw);

    if (!data.usageStats) {
      return NextResponse.json({ error: "No usageStats in profiles file" }, { status: 404 });
    }

    if (!data.usageStats[profileId]) {
      return NextResponse.json({ error: "Profile not found in usageStats" }, { status: 404 });
    }

    // Clear all cooldown/disabled flags
    delete data.usageStats[profileId].cooldownUntil;
    delete data.usageStats[profileId].disabledUntil;
    delete data.usageStats[profileId].disabledReason;

    // Atomic write: write to tmp, then rename
    const tmpPath = profilesPath + ".divan-reset.tmp";
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmpPath, profilesPath);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
