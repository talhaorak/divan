import { NextResponse } from "next/server";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
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

const WINDOW_MS = 10 * 60 * 1000;
const MAX_RAW_CHARS = 4000;

type ToolTraceEvent = {
  agentId: string;
  ts: string;
  ageMs: number;
  tool: string;
  category: string;
  toolCallId: string;
  args?: Record<string, unknown>;
  // extracted convenience fields
  command?: string;
  url?: string;
  status?: number;
  ok?: boolean;
  // result
  isError?: boolean;
  exitCode?: number;
  durationMs?: number;
  resultText?: string;
  resultRaw?: string;
};

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "\n…(truncated)…";
}

function extractResultText(content: unknown): string {
  // toolResult message content is usually [{type:'text', text:'...'}]
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const c of content as Array<Record<string, unknown>>) {
      const t = c?.text;
      if (typeof t === "string") parts.push(t);
    }
    return parts.join("\n");
  }
  if (typeof content === "string") return content;
  return "";
}

function listRecentSessionFiles(agentId: string): { path: string; mtime: number }[] {
  const sessionsDir = join(AGENTS_BASE_DIR, agentId, "sessions");
  const files = readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({
      path: join(sessionsDir, f),
      mtime: statSync(join(sessionsDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.slice(0, 3);
}

function readToolTraceForAgent(agentId: string, category?: string, tool?: string, limit = 20): ToolTraceEvent[] {
  const now = Date.now();
  const events: ToolTraceEvent[] = [];

  let files: { path: string; mtime: number }[] = [];
  try {
    files = listRecentSessionFiles(agentId);
  } catch {
    return [];
  }

  // Track tool calls so we can attach results when they arrive
  const calls = new Map<string, ToolTraceEvent>();

  for (const f of files) {
    let raw = "";
    try {
      raw = readFileSync(f.path, "utf-8");
    } catch {
      continue;
    }

    const lines = raw.trim().split("\n").slice(-1200);

    for (const line of lines) {
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      if (obj?.type !== "message") continue;
      const msg = obj.message || obj;
      const ts = obj.timestamp || msg.timestamp || "";
      const tsMs = ts ? new Date(ts).getTime() : 0;
      const ageMs = now - tsMs;
      if (!tsMs || ageMs > WINDOW_MS) continue;

      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c?.type !== "toolCall") continue;
          const name = String(c.name || "");
          const cat = TOOL_CATEGORIES[name] || "other";
          if (category && cat !== category) continue;
          if (tool && name !== tool) continue;

          const toolCallId = String(c.id || "");
          const args = (typeof c.arguments === "string" ? safeJsonParse(c.arguments) : c.arguments) || {};

          const ev: ToolTraceEvent = {
            agentId,
            ts,
            ageMs,
            tool: name,
            category: cat,
            toolCallId,
            args: typeof args === "object" && args ? (args as Record<string, unknown>) : undefined,
          };

          // Extract common fields
          if (name === "exec") {
            if (ev.args && typeof ev.args.command === "string") ev.command = ev.args.command;
          }
          if (name === "web_fetch" || name === "browser") {
            if (ev.args && typeof ev.args.url === "string") ev.url = ev.args.url;
            if (ev.args && typeof ev.args.targetUrl === "string") ev.url = ev.args.targetUrl;
          }

          calls.set(toolCallId, ev);
          // We push call events too (so user sees "in flight" even before result)
          events.push(ev);
        }
      }

      if (msg.role === "toolResult") {
        const toolCallId = String(msg.toolCallId || "");
        const toolName = String(msg.toolName || "");
        const cat = TOOL_CATEGORIES[toolName] || "other";
        if (category && cat !== category) continue;
        if (tool && toolName !== tool) continue;

        const base = calls.get(toolCallId) || {
          agentId,
          ts,
          ageMs,
          tool: toolName,
          category: cat,
          toolCallId,
        };

        const resultText = extractResultText(msg.content);
        const rawTrunc = truncate(resultText, MAX_RAW_CHARS);

        const merged: ToolTraceEvent = {
          ...base,
          tool: toolName,
          category: cat,
          isError: Boolean(msg.isError),
          exitCode: typeof msg.details?.exitCode === "number" ? msg.details.exitCode : undefined,
          durationMs: typeof msg.details?.durationMs === "number" ? msg.details.durationMs : undefined,
          resultText: truncate(resultText, 800),
          resultRaw: rawTrunc,
        };

        // Try to extract structured web_fetch status if the result is JSON
        const parsed = safeJsonParse(resultText);
        if (parsed && typeof parsed === "object") {
          const p: any = parsed;
          if (typeof p.status === "number") merged.status = p.status;
          if (typeof p.ok === "boolean") merged.ok = p.ok;
          if (!merged.url && typeof p.url === "string") merged.url = p.url;
          if (!merged.url && typeof p.finalUrl === "string") merged.url = p.finalUrl;
        }

        events.push(merged);
      }
    }
  }

  // Return newest-first, dedupe by toolCallId+tool+ts (keep last)
  const uniq = new Map<string, ToolTraceEvent>();
  for (const e of events) {
    const k = `${e.toolCallId}:${e.tool}:${e.ts}:${e.resultRaw ? "r" : "c"}`;
    uniq.set(k, e);
  }
  const arr = Array.from(uniq.values()).sort((a, b) => b.ageMs - a.ageMs);
  return arr.slice(0, limit);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get("agent") || "all";
  const category = searchParams.get("category") || undefined;
  const tool = searchParams.get("tool") || undefined;
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

  try {
    const discoveredAgents = await discoverAgents();
    const agentIds = discoveredAgents.map((a) => a.id);

    const targets = agent === "all" ? agentIds : agentIds.includes(agent) ? [agent] : ["main"];

    const byAgent: Record<string, ToolTraceEvent[]> = {};
    for (const id of targets) {
      byAgent[id] = readToolTraceForAgent(id, category, tool, limit);
    }

    return NextResponse.json({
      window: "10min",
      category: category || null,
      tool: tool || null,
      limit,
      byAgent,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
