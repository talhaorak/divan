import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { discoverAgents } from "@/lib/agents";

interface ProfileEntry {
  provider: string;
  type: string;
}

interface ProfileStat {
  lastUsed?: number;
  errorCount?: number;
  lastFailureAt?: number;
  failureCounts?: Record<string, number>;
  cooldownUntil?: number;
  disabledUntil?: number;
  disabledReason?: string;
}

interface AuthProfilesFile {
  version?: number;
  profiles?: Record<string, ProfileEntry>;
  lastGood?: Record<string, string>;
  usageStats?: Record<string, ProfileStat>;
}

export interface AgentProfileInfo {
  profileId: string;
  provider: string;
  type: string;
  status: "ok" | "cooldown" | "disabled";
  cooldownUntil?: number;
  cooldownRemainingMs?: number;
  disabledUntil?: number;
  disabledReason?: string;
  errorCount: number;
  lastFailureAt?: number;
  failureCounts: Record<string, number>;
  isLastGood: boolean;
}

export async function GET() {
  const agents = await discoverAgents();
  const result: Record<string, AgentProfileInfo[]> = {};
  const now = Date.now();

  for (const agent of agents) {
    const profilesPath = path.join(
      os.homedir(),
      ".openclaw",
      "agents",
      agent.id,
      "agent",
      "auth-profiles.json"
    );

    try {
      const raw = await fs.readFile(profilesPath, "utf-8");
      const data: AuthProfilesFile = JSON.parse(raw);

      const profiles: AgentProfileInfo[] = [];
      const lastGood = data.lastGood || {};

      for (const [profileId, profileData] of Object.entries(data.profiles || {})) {
        const stats: ProfileStat = data.usageStats?.[profileId] || {};

        let status: "ok" | "cooldown" | "disabled" = "ok";
        let cooldownRemainingMs: number | undefined;

        if (stats.disabledUntil && stats.disabledUntil > now) {
          status = "disabled";
        } else if (stats.cooldownUntil && stats.cooldownUntil > now) {
          status = "cooldown";
          cooldownRemainingMs = stats.cooldownUntil - now;
        }

        const provider = profileData.provider;
        const isLastGood = lastGood[provider] === profileId;

        profiles.push({
          profileId,
          provider,
          type: profileData.type,
          status,
          cooldownUntil: stats.cooldownUntil,
          cooldownRemainingMs,
          disabledUntil: stats.disabledUntil,
          disabledReason: stats.disabledReason,
          errorCount: stats.errorCount || 0,
          lastFailureAt: stats.lastFailureAt,
          failureCounts: stats.failureCounts || {},
          isLastGood,
        });
      }

      result[agent.id] = profiles;
    } catch {
      result[agent.id] = [];
    }
  }

  return NextResponse.json({ agents: result, timestamp: now });
}
