import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), "clawd");
const OPENCLAW_DIR = path.join(os.homedir(), ".openclaw");

interface Activity {
  id: string;
  agent: string;
  emoji: string;
  action: string;
  detail: string;
  time: string;
  timestamp: number;
  color: string;
}

// Runtime cache for agent display info (populated lazily from discoverAgents)
let _agentMetaCache: Record<string, { name: string; emoji: string; color: string }> | null = null;
let _agentMetaCacheTime = 0;
const AGENT_META_CACHE_TTL = 30_000;

async function getAgentMetaMap(): Promise<Record<string, { name: string; emoji: string; color: string }>> {
  const now = Date.now();
  if (_agentMetaCache && now - _agentMetaCacheTime < AGENT_META_CACHE_TTL) {
    return _agentMetaCache;
  }
  try {
    const { discoverAgents } = await import("@/lib/agents");
    const agents = await discoverAgents();
    _agentMetaCache = {};
    for (const a of agents) {
      _agentMetaCache[a.id] = { name: a.name, emoji: a.emoji, color: a.color };
    }
  } catch {
    _agentMetaCache = {};
  }
  _agentMetaCacheTime = now;
  return _agentMetaCache;
}

function agentMetaSync(agentId: string, metaMap: Record<string, { name: string; emoji: string; color: string }>) {
  return metaMap[agentId] || { name: agentId, emoji: "🤖", color: "#6b7280" };
}

export async function GET() {
  const activities: Activity[] = [];
  const metaMap = await getAgentMetaMap();
  // Derive a "primary" agent (main) for memory file activities
  const primaryMeta = agentMetaSync("main", metaMap);

  // ── 1. Git log — recent commits ──────────────────────────────────
  try {
    const { stdout } = await execAsync(
      `cd "${WORKSPACE}" && git log --oneline -15 --format='%H|%ai|%s'`
    );
    for (const line of stdout.trim().split("\n")) {
      if (!line) continue;
      const [hash, dateStr, ...msgParts] = line.split("|");
      const msg = msgParts.join("|");
      const ts = new Date(dateStr).getTime();
      const agent = inferAgent(msg, metaMap);

      activities.push({
        id: `git-${hash.slice(0, 8)}`,
        agent: agent.name,
        emoji: agent.emoji,
        action: inferAction(msg),
        detail: msg,
        time: relativeTime(ts),
        timestamp: ts,
        color: agent.color,
      });
    }
  } catch {
    // git not available
  }

  // ── 2. Memory file changes — recent .md files ───────────────────
  try {
    const memDir = path.join(WORKSPACE, "memory");
    const files = await fs.readdir(memDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    for (const file of mdFiles.slice(0, 10)) {
      const stat = await fs.stat(path.join(memDir, file));
      const ts = stat.mtimeMs;
      if (Date.now() - ts > 48 * 60 * 60 * 1000) continue;

      activities.push({
        id: `mem-${file}`,
        agent: primaryMeta.name,
        emoji: primaryMeta.emoji,
        action: "Hafıza",
        detail: `${file} güncellendi`,
        time: relativeTime(ts),
        timestamp: ts,
        color: primaryMeta.color,
      });
    }
  } catch {
    // memory dir not found
  }

  // ── 3. Cron job executions ──────────────────────────────────────
  try {
    const cronFile = path.join(OPENCLAW_DIR, "cron/jobs.json");
    const raw = await fs.readFile(cronFile, "utf-8");
    const data = JSON.parse(raw);
    const jobs: Array<{
      id: string;
      name?: string;
      agentId?: string;
      state?: {
        lastRunAtMs?: number;
        lastStatus?: string;
        lastDurationMs?: number;
      };
    }> = data.jobs || [];

    for (const job of jobs) {
      const lastRun = job.state?.lastRunAtMs;
      if (!lastRun) continue;
      // Only include cron runs from last 7 days
      if (Date.now() - lastRun > 7 * 24 * 60 * 60 * 1000) continue;

      const status = job.state?.lastStatus || "?";
      const statusEmoji = status === "ok" ? "✅" : status === "error" ? "❌" : "⚠️";
      const durationMs = job.state?.lastDurationMs;
      const jobName = job.name || job.id.slice(0, 8);
      const agentId = job.agentId || "main";
      const meta = agentMetaSync(agentId, metaMap);

      activities.push({
        id: `cron-${job.id}-${lastRun}`,
        agent: meta.name,
        emoji: "⏰",
        action: "Cron",
        detail: `${statusEmoji} ${jobName} çalıştı (${status})${durationMs ? ` — ${durationMs}ms` : ""}`,
        time: relativeTime(lastRun),
        timestamp: lastRun,
        color: status === "ok" ? "#059669" : status === "error" ? "#dc2626" : "#d97706",
      });
    }
  } catch {
    // cron file not found or parse error
  }

  // ── 4. Other agent sessions — recent activity ───────────────────
  try {
    const agentsDir = path.join(OPENCLAW_DIR, "agents");
    const agentDirs = await fs.readdir(agentsDir);

    for (const agentId of agentDirs) {
      const sessionsDir = path.join(agentsDir, agentId, "sessions");
      try {
        // Read sessions.json index for latest sessions
        const indexPath = path.join(sessionsDir, "sessions.json");
        const indexRaw = await fs.readFile(indexPath, "utf-8");
        const index = JSON.parse(indexRaw) as Record<string, { updatedAt?: number; sessionId?: string }>;

        // Sort by updatedAt descending, take top 3
        const entries = Object.entries(index)
          .map(([key, val]) => ({ key, sessionId: val.sessionId || "", updatedAt: val.updatedAt || 0 }))
          .filter((e) => e.updatedAt > 0)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 3);

        for (const entry of entries) {
          const ago = Date.now() - entry.updatedAt;
          // Only show if updated within 48 hours
          if (ago > 48 * 60 * 60 * 1000) continue;

          const meta = agentMetaSync(agentId, metaMap);

          // Try to read the last message from the session JSONL for more detail
          let lastAction = "Oturum güncellendi";
          if (entry.sessionId) {
            try {
              const jsonlPath = path.join(sessionsDir, `${entry.sessionId}.jsonl`);
              const content = await fs.readFile(jsonlPath, "utf-8");
              const lines = content.trim().split("\n").filter(Boolean);
              // Walk from end to find last assistant tool call or message
              for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
                try {
                  const msg = JSON.parse(lines[i]) as {
                    type?: string;
                    message?: {
                      role?: string;
                      content?: Array<{ type?: string; name?: string; text?: string }>;
                    };
                  };
                  if (msg.type === "message" && msg.message?.role === "assistant") {
                    const content = msg.message.content || [];
                    const toolCall = content.find((c) => c.type === "toolCall");
                    if (toolCall?.name) {
                      lastAction = `${toolCall.name} çağırdı`;
                      break;
                    }
                    const textPart = content.find((c) => c.type === "text" && c.text);
                    if (textPart?.text) {
                      lastAction = textPart.text.slice(0, 60).replace(/\n/g, " ");
                      break;
                    }
                  }
                } catch {
                  // skip malformed line
                }
              }
            } catch {
              // session file not readable
            }
          }

          // Extract channel from session key
          const channelLabel = extractChannelLabel(entry.key);

          activities.push({
            id: `session-${agentId}-${entry.sessionId || entry.key}`,
            agent: meta.name,
            emoji: meta.emoji,
            action: channelLabel,
            detail: lastAction,
            time: relativeTime(entry.updatedAt),
            timestamp: entry.updatedAt,
            color: meta.color,
          });
        }
      } catch {
        // agent sessions dir or index not readable
      }
    }
  } catch {
    // agents dir not found
  }

  // ── 5. Jobs state (legacy) ──────────────────────────────────────
  try {
    const stateFile = path.join(WORKSPACE, "memory/jobs/state.json");
    const raw = await fs.readFile(stateFile, "utf-8");
    const state = JSON.parse(raw);
    if (state.changes && state.changes.length > 0) {
      for (const change of state.changes.slice(0, 5)) {
        const ts = change.timestamp || Date.now();
        activities.push({
          id: `job-${change.id || Math.random().toString(36).slice(2)}`,
          agent: "Sistem",
          emoji: "⚙️",
          action: "Job",
          detail: change.message || `Job ${change.status || "update"}`,
          time: relativeTime(ts),
          timestamp: ts,
          color: "#3b82f6",
        });
      }
    }
  } catch {
    // no jobs state
  }

  // ── Deduplicate & sort ──────────────────────────────────────────
  // Remove memory file entries already covered by git commits
  const gitDetails = new Set(
    activities.filter((a) => a.id.startsWith("git-")).map((a) => a.detail)
  );
  // Deduplicate by id
  const seen = new Set<string>();
  const deduped = activities.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    if (a.id.startsWith("mem-")) {
      const filename = a.detail.replace(" güncellendi", "");
      if (gitDetails.has(filename)) return false;
    }
    return true;
  });

  deduped.sort((a, b) => b.timestamp - a.timestamp);

  return NextResponse.json({ activities: deduped.slice(0, 25) });
}

function inferAgent(
  msg: string,
  metaMap: Record<string, { name: string; emoji: string; color: string }>
): { name: string; emoji: string; color: string } {
  const lower = msg.toLowerCase();
  // Try to match any known agent name in the commit message
  for (const meta of Object.values(metaMap)) {
    if (lower.includes(meta.name.toLowerCase())) return meta;
  }
  // Default to main agent
  return metaMap["main"] || { name: "Agent", emoji: "🤖", color: "#6b7280" };
}

function inferAction(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("heartbeat")) return "Heartbeat";
  if (lower.includes("memory") || lower.includes("hafıza")) return "Hafıza";
  if (lower.includes("journal") || lower.includes("daily")) return "Günlük";
  if (lower.includes("feat:")) return "Geliştirme";
  if (lower.includes("fix:") || lower.includes("fix")) return "Düzeltme";
  if (lower.includes("docs:")) return "Dokümantasyon";
  if (lower.includes("chore:")) return "Bakım";
  if (lower.includes("data:")) return "Veri";
  if (lower.includes("protocol")) return "Protokol";
  if (lower.includes("optimize")) return "Optimizasyon";
  if (lower.includes("checkpoint") || lower.includes("backup")) return "Yedekleme";
  return "Commit";
}

function extractChannelLabel(key: string): string {
  if (key.includes("matrix")) return "Matrix";
  if (key.includes("telegram")) return "Telegram";
  if (key.includes("whatsapp")) return "WhatsApp";
  if (key.includes("subagent")) return "Sub-agent";
  if (key.includes("cron")) return "Cron";
  return "Session";
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "dün";
  return `${days} gün önce`;
}
