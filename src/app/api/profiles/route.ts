import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { discoverAgents } from "@/lib/agents";

interface ProfileEntry {
  provider: string;
  type: string;
  // credential fields intentionally not typed here — never returned to client
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
  /** Last known error message for this provider (from recent sessions) */
  lastErrorText?: string;
  /** Whether a credential value exists (never exposes the value itself) */
  hasCredential: boolean;
  /** Masked display of credential: first8…last4, e.g. "sk-ant-oa…gAA" */
  maskedCredential?: string;
}

// ─── Session error extraction ─────────────────────────────────────────────────

/**
 * Scans the last N .jsonl session files for an agent, looking for
 * "Agent failed before reply: All models failed …" messages.
 * Returns { providerName: "last error text" }.
 */
async function readRecentSessionErrors(agentId: string): Promise<Record<string, string>> {
  const sessionsDir = path.join(os.homedir(), ".openclaw", "agents", agentId, "sessions");
  try {
    const entries = await fs.readdir(sessionsDir);
    const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));

    // stat all in parallel (we only need mtime)
    const stats = await Promise.all(
      jsonlFiles.map(async (f) => {
        try {
          const st = await fs.stat(path.join(sessionsDir, f));
          return { f, mtime: st.mtimeMs };
        } catch {
          return null;
        }
      })
    );
    const sorted = stats
      .filter(Boolean)
      .sort((a, b) => b!.mtime - a!.mtime)
      .slice(0, 7) as { f: string; mtime: number }[];

    const providerErrors: Record<string, string> = {};

    await Promise.all(
      sorted.map(async ({ f }) => {
        const fp = path.join(sessionsDir, f);
        try {
          const stat = await fs.stat(fp);
          const readSize = Math.min(40000, stat.size);
          const handle = await fs.open(fp, "r");
          const buf = Buffer.alloc(readSize);
          await handle.read(buf, 0, readSize, Math.max(0, stat.size - readSize));
          await handle.close();
          const content = buf.toString("utf-8");

          for (const line of content.split("\n")) {
            try {
              const ev = JSON.parse(line);
              if (ev.type !== "message") continue;
              const msg = ev.message;
              let text = "";
              const c = msg?.content;
              if (typeof c === "string") {
                text = c;
              } else if (Array.isArray(c)) {
                for (const seg of c) {
                  if (seg?.type === "text") text += seg.text || "";
                }
              }
              // Pattern: "Agent failed before reply: All models failed (N): prov/model: msg (code) | ..."
              const failMatch = text.match(
                /Agent failed before reply:\s*All models failed\s*\(\d+\):\s*([\s\S]+)/
              );
              if (!failMatch) continue;
              const parts = failMatch[1].split(" | ");
              for (const part of parts) {
                const m = part.match(/^([^/\s]+)\/[^:]+:\s*(.+?)\s*\(([^)]+)\)/);
                if (m) {
                  const prov = m[1].trim();
                  const errMsg = m[2].trim();
                  const code = m[3].trim();
                  if (!providerErrors[prov]) {
                    providerErrors[prov] = `${errMsg} (${code})`;
                  }
                }
              }
            } catch {
              // skip malformed line
            }
          }
        } catch {
          // skip unreadable file
        }
      })
    );

    return providerErrors;
  } catch {
    return {};
  }
}

// ─── Credential masking (server-side only, never expose actual value) ─────────

function maskCredential(raw: string): string {
  if (!raw || raw.length <= 8) return "****";
  return raw.slice(0, 8) + "…" + raw.slice(-3);
}

function extractCredential(profile: Record<string, unknown>): string | undefined {
  // OAuth profiles don't have a simple credential to show
  if (profile.type === "oauth") return undefined;
  const val = (profile.token ?? profile.key ?? profile.access) as string | undefined;
  return typeof val === "string" ? val : undefined;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const agents = await discoverAgents();
  const result: Record<string, AgentProfileInfo[]> = {};
  const now = Date.now();

  await Promise.all(
    agents.map(async (agent) => {
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

        const lastGood = data.lastGood || {};
        const providerErrors = await readRecentSessionErrors(agent.id);
        const profiles: AgentProfileInfo[] = [];

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

          // Mask credential for safe display — never return actual value
          const rawEntry = data.profiles![profileId] as unknown as Record<string, unknown>;
          const rawCred = extractCredential(rawEntry);
          const hasCredential = !!rawCred;
          const maskedCredential = rawCred ? maskCredential(rawCred) : undefined;

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
            lastErrorText: providerErrors[provider],
            hasCredential,
            maskedCredential,
          });
        }

        result[agent.id] = profiles;
      } catch {
        result[agent.id] = [];
      }
    })
  );

  return NextResponse.json({ agents: result, timestamp: now });
}
