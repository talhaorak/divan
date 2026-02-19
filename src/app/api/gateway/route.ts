import { NextResponse } from "next/server";
import { gwHealth } from "@/lib/gateway";
import { discoverAgents } from "@/lib/agents";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function GET() {
  // 1. Gateway health
  const health = await gwHealth();

  // 2. Discover agents dynamically
  const discoveredAgents = await discoverAgents();
  const agentIds = discoveredAgents.map((a) => a.id);

  // 3. Get sessions by reading session index files for each discovered agent
  let sessions: SessionInfo[] = [];
  for (const agentId of agentIds) {
    try {
      const indexPath = path.join(
        os.homedir(),
        ".openclaw",
        "agents",
        agentId,
        "sessions",
        "sessions.json"
      );
      const raw = await fs.readFile(indexPath, "utf-8");
      const index = JSON.parse(raw);
      for (const [key, val] of Object.entries(index)) {
        const v = val as Record<string, unknown>;
        sessions.push({
          key,
          updatedAt: (v.updatedAt as number) || 0,
          sessionId: (v.sessionId as string) || "",
          agent: agentId,
          channel: extractChannel(key),
          active: Date.now() - ((v.updatedAt as number) || 0) < 300000,
        });
      }
    } catch {
      // agent dir not found
    }
  }

  // 4. Cron jobs summary from file
  let cronJobs: CronSummary[] = [];
  try {
    const workspace =
      process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), "clawd");
    const cronPath = path.join(workspace, ".openclaw", "cron-state.json");
    const raw = await fs.readFile(cronPath, "utf-8");
    const data = JSON.parse(raw);
    cronJobs = (data.jobs || []).map((j: Record<string, unknown>) => ({
      id: j.id,
      name: j.name,
      enabled: j.enabled,
      lastStatus: (j as Record<string, string>).lastStatus || "unknown",
    }));
  } catch {
    // nothing
  }

  // 5. Derive agent statuses from sessions
  const agentStatuses = deriveAgentStatuses(sessions, agentIds, health.ok);

  return NextResponse.json({
    health,
    sessions: sessions.slice(0, 20),
    cronJobs,
    agents: agentStatuses,
    timestamp: Date.now(),
  });
}

interface SessionInfo {
  key: string;
  sessionId: string;
  agent: string;
  channel: string;
  active: boolean;
  updatedAt: number;
  model?: string;
  tokenUsage?: string;
}

interface CronSummary {
  id: unknown;
  name: unknown;
  enabled: unknown;
  lastStatus: string;
  nextRunAt?: unknown;
}

function extractChannel(key: string): string {
  if (key.includes("matrix")) return "matrix";
  if (key.includes("telegram")) return "telegram";
  if (key.includes("whatsapp")) return "whatsapp";
  if (key.includes("cron")) return "cron";
  return "direct";
}

function deriveAgentStatuses(
  sessions: SessionInfo[],
  agentIds: string[],
  gatewayHealthy = false
): Record<string, { status: string; lastSeen: number; activeSessions: number }> {
  // Initialise all known agents as sleeping
  const agents: Record<
    string,
    { status: string; lastSeen: number; activeSessions: number }
  > = {};
  for (const id of agentIds) {
    agents[id] = { status: "sleeping", lastSeen: 0, activeSessions: 0 };
  }

  const now = Date.now();

  for (const s of sessions) {
    const agentKey = s.agent;
    if (!agents[agentKey]) continue;

    if (s.updatedAt > agents[agentKey].lastSeen) {
      agents[agentKey].lastSeen = s.updatedAt;
    }
    if (now - s.updatedAt < 300000) {
      agents[agentKey].activeSessions++;
    }
  }

  // Derive status from recency:
  // "active"  = gateway healthy AND active sessions within 5 min
  // "idle"    = last seen within 2 hours
  // "standby" = last seen within 24 hours
  // "sleeping"= no activity in 24+ hours
  for (const [key, agent] of Object.entries(agents)) {
    const ago = now - agent.lastSeen;

    if (key === "main" && gatewayHealthy && agent.activeSessions > 0) {
      agent.status = "active";
    } else if (agent.activeSessions > 0) {
      agent.status = "active";
    } else if (ago < 7200000) {
      agent.status = "idle";
    } else if (ago < 86400000) {
      agent.status = "standby";
    } else {
      agent.status = "sleeping";
    }
  }

  return agents;
}
