import { NextResponse } from "next/server";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import os from "os";
import { discoverAgents } from "@/lib/agents";

const AGENTS_BASE_DIR = join(os.homedir(), ".openclaw/agents");

const TOOL_CATEGORIES: Record<string, string> = {
  exec: "terminal",
  read: "files",
  write: "files",
  edit: "files",
  web_search: "internet",
  web_fetch: "internet",
  browser: "internet",
  memory_search: "memory",
  memory_get: "memory",
  sessions_list: "agents",
  sessions_send: "agents",
  sessions_spawn: "agents",
  subagents: "agents",
  sessions_history: "agents",
  cron: "system",
  gateway: "system",
  message: "comms",
  tts: "comms",
  image: "media",
  canvas: "media",
  nodes: "devices",
};

const WINDOW_MS = 10 * 60 * 1000; // 10 minute window

interface ToolCall {
  name: string;
  ts: string;
  ageMs: number;
  category: string;
}
interface SubAgent {
  task: string;
  ts: string;
  status: string;
}
interface Connection {
  from: string;
  to: string;
  type: string;
  ts: string;
}
interface CategoryAgg {
  count: number;
  lastTs: string;
  tools: string[];
}

interface AgentSessionData {
  sessionFile: string;
  toolCategories: Record<string, CategoryAgg>;
  recentTools: ToolCall[];
  subAgents: SubAgent[];
  connections: Connection[];
  totalToolCalls: number;
}

/**
 * Read and parse the most recent session file for a given agent.
 * Returns null if agent dir or sessions don't exist.
 */
function readAgentSessions(agentId: string): AgentSessionData | null {
  const sessionsDir = join(AGENTS_BASE_DIR, agentId, "sessions");

  try {
    const files = readdirSync(sessionsDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({
        name: f,
        path: join(sessionsDir, f),
        mtime: statSync(join(sessionsDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) return null;

    const activeFile = files[0];
    const raw = readFileSync(activeFile.path, "utf-8");
    const lines = raw.trim().split("\n");
    const recentLines = lines.slice(-300);
    const now = Date.now();

    const toolCalls: ToolCall[] = [];
    const subAgents: SubAgent[] = [];
    const connections: Connection[] = [];

    const agentDisplayName = agentId;

    for (const line of recentLines) {
      try {
        const obj = JSON.parse(line);
        const msg = obj.message || obj;
        const ts = obj.timestamp || "";
        const tsMs = ts ? new Date(ts).getTime() : 0;
        const ageMs = now - tsMs;

        if (ageMs > WINDOW_MS) continue;

        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c.type === "toolCall") {
              const name = c.name || "";
              toolCalls.push({
                name,
                ts,
                ageMs,
                category: TOOL_CATEGORIES[name] || "other",
              });

              if (name === "sessions_spawn") {
                const args =
                  typeof c.arguments === "string"
                    ? JSON.parse(c.arguments)
                    : c.arguments || {};
                subAgents.push({
                  task: args.task?.slice(0, 80) || "unknown",
                  ts,
                  status: "spawned",
                });
              }

              if (name === "sessions_send") {
                const args =
                  typeof c.arguments === "string"
                    ? JSON.parse(c.arguments)
                    : c.arguments || {};
                connections.push({
                  from: agentDisplayName,
                  to:
                    args.label ||
                    args.sessionKey?.split(":")[1] ||
                    "unknown",
                  type: "message",
                  ts,
                });
              }
            }
          }
        }
      } catch {
        // skip malformed lines
      }
    }

    // Aggregate tool usage by category
    const categoryAgg: Record<string, CategoryAgg> = {};
    for (const tc of toolCalls) {
      if (!categoryAgg[tc.category]) {
        categoryAgg[tc.category] = { count: 0, lastTs: "", tools: [] };
      }
      categoryAgg[tc.category].count++;
      categoryAgg[tc.category].lastTs = tc.ts;
      if (!categoryAgg[tc.category].tools.includes(tc.name)) {
        categoryAgg[tc.category].tools.push(tc.name);
      }
    }

    return {
      sessionFile: activeFile.name,
      toolCategories: categoryAgg,
      recentTools: toolCalls.slice(-20).reverse(),
      subAgents,
      connections,
      totalToolCalls: toolCalls.length,
    };
  } catch {
    return null;
  }
}

/**
 * GET /api/live?agent=<agentId>
 * Returns recent tool calls, sub-agent activity, and inter-agent messages.
 * - No agent param: returns main agent data + agentToolUsage for all agents (for 3D scene)
 * - agent=<id>: returns that agent's data + agentToolUsage
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentParam = searchParams.get("agent");

  try {
    // Dynamically discover agents
    const discoveredAgents = await discoverAgents();
    const agentIds = discoveredAgents.map((a) => a.id);

    // Read ALL agent sessions for the 3D scene multi-agent beams
    const agentToolUsage: Record<string, AgentSessionData | null> = {};
    for (const agentId of agentIds) {
      agentToolUsage[agentId] = readAgentSessions(agentId);
    }

    // Determine which agent's data to return as the "primary" feed
    const primaryAgentId = agentParam && agentIds.includes(agentParam) ? agentParam : "main";
    const primaryData = agentToolUsage[primaryAgentId];

    // Fetch real sub-agents from OpenClaw CLI
    let realSubAgents: {
      label: string;
      task: string;
      parentAgent: string;
      status: string;
      startedAt: string;
    }[] = [];

    try {
      const sessionsRaw = execSync(
        'openclaw sessions list --json 2>/dev/null || echo "[]"',
        { timeout: 3000, encoding: "utf-8" }
      ).trim();
      const sessions = JSON.parse(sessionsRaw || "[]");
      realSubAgents = (Array.isArray(sessions) ? sessions : [])
        .filter(
          (s: Record<string, unknown>) =>
            s.kind === "subagent" || (s.key as string)?.includes("spawn")
        )
        .map((s: Record<string, unknown>) => ({
          label: (s.label as string) || (s.displayName as string) || "sub-agent",
          task: (s.task as string) || (s.displayName as string) || "unknown",
          parentAgent: primaryAgentId,
          status:
            Date.now() - (s.updatedAt as number) < 60000 ? "running" : "done",
          startedAt: new Date(
            (s.updatedAt as number) || Date.now()
          ).toISOString(),
        }));
    } catch {
      // Fallback: use transcript-detected sub-agents
      realSubAgents = (primaryData?.subAgents || []).map((s) => ({
        ...s,
        label: s.task?.slice(0, 20) || "sub-agent",
        parentAgent: primaryAgentId,
        startedAt: s.ts,
      }));
    }

    return NextResponse.json({
      sessionFile: primaryData?.sessionFile || "",
      window: "10min",
      toolCategories: primaryData?.toolCategories || {},
      recentTools: primaryData?.recentTools || [],
      subAgents: realSubAgents,
      connections: primaryData?.connections || [],
      totalToolCalls: primaryData?.totalToolCalls || 0,
      // Multi-agent tool usage for 3D scene beams
      agentToolUsage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, tools: [], subAgents: [], connections: [] },
      { status: 500 }
    );
  }
}
