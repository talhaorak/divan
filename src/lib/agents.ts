import fs from "fs/promises";
import path from "path";
import os from "os";

export interface DiscoveredAgent {
  id: string;          // directory name, e.g. "main", "handan"
  name: string;        // from IDENTITY.md or titlecase of id
  emoji: string;       // from IDENTITY.md or 🤖
  color: string;       // from palette
  role: string;        // from IDENTITY.md or "Agent"
  description: string; // from SOUL.md first paragraph
  capabilities: string[]; // bullet points from SOUL.md
  hasWorkspace: boolean;  // true if workspace is known
  primaryModel?: string;  // from agent/defaults.json
  fallbackModels?: string[]; // from agent/defaults.json
}

const COLOR_PALETTE = ["#dc2626", "#7c3aed", "#059669", "#d97706", "#2563eb"];

// Simple 30-second cache
let cache: DiscoveredAgent[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 30_000;

/**
 * Parse IDENTITY.md to extract name, emoji.
 * Format varies — looks for headings or first lines containing an emoji.
 */
function parseIdentityMd(content: string): { name?: string; emoji?: string } {
  const lines = content.trim().split("\n");

  // Look for a heading line (# or ##)
  for (const line of lines.slice(0, 8)) {
    const headMatch = line.match(/^#{1,2}\s+(.+)/);
    if (!headMatch) continue;
    const text = headMatch[1].trim();
    // Try to extract an emoji (basic Unicode ranges for common emoji)
    const emojiMatch = text.match(
      /[\u{1F300}-\u{1FAD6}]|[\u{2600}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|\u{1F9E0}/u
    );
    if (emojiMatch) {
      const emoji = emojiMatch[0];
      const idx = text.indexOf(emoji);
      const before = text.slice(0, idx).trim();
      const name = before || text.replace(emoji, "").trim().split(/\s+/).slice(0, 4).join(" ");
      return { name: name || undefined, emoji };
    }
    // No emoji in heading — just take the heading text as name
    return { name: text.split(/\s+/).slice(0, 4).join(" ") || undefined };
  }

  // No heading — try first non-empty line
  // Format: "Name Emoji Description..." or just "Name Description..."
  const firstLine = lines.find((l) => l.trim())?.trim() || "";
  const emojiMatch = firstLine.match(
    /[\u{1F300}-\u{1FAD6}]|[\u{2600}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F600}-\u{1F64F}]/u
  );
  if (emojiMatch) {
    const emoji = emojiMatch[0];
    const idx = firstLine.indexOf(emoji);
    const before = firstLine.slice(0, idx).trim();
    const name = before || undefined;
    return { name, emoji };
  }

  // No emoji — take first few words as name
  const words = firstLine.split(/\s+/).slice(0, 3).join(" ");
  return { name: words || undefined };
}

/**
 * Parse SOUL.md for a short description and bullet-point capabilities.
 */
function parseSoulMd(content: string): { description: string; capabilities: string[] } {
  const lines = content.trim().split("\n");
  let description = "";
  const capabilities: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (!description && !trimmed.startsWith("-") && !trimmed.startsWith("*")) {
      description = trimmed.slice(0, 120);
      continue;
    }

    // Bullet points → capabilities
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (bulletMatch && capabilities.length < 8) {
      capabilities.push(bulletMatch[1].trim());
    }
  }

  return { description, capabilities };
}

export async function discoverAgents(): Promise<DiscoveredAgent[]> {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;

  const agentsDir = path.join(os.homedir(), ".openclaw", "agents");
  const mainWorkspace =
    process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), ".openclaw", "workspace");

  try {
    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const agents: DiscoveredAgent[] = [];

    for (let i = 0; i < dirs.length; i++) {
      const agentId = dirs[i];

      // Determine workspace for this agent
      let agentWorkspace: string | null = null;
      if (agentId === "main") {
        agentWorkspace = mainWorkspace;
      } else {
        const envKey = `OPENCLAW_WORKSPACE_${agentId
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "_")}`;
        agentWorkspace = process.env[envKey] || null;
      }

      // Capitalise first letter of id as default name
      let name = agentId.charAt(0).toUpperCase() + agentId.slice(1);
      let emoji = "🤖";
      let description = "";
      let capabilities: string[] = [];

      // Read IDENTITY.md (prefer workspace copy, fall back to agent dir)
      const identityPaths = [
        agentWorkspace && path.join(agentWorkspace, "IDENTITY.md"),
        path.join(agentsDir, agentId, "IDENTITY.md"),
      ].filter(Boolean) as string[];

      for (const identityPath of identityPaths) {
        try {
          const content = await fs.readFile(identityPath, "utf-8");
          const parsed = parseIdentityMd(content);
          if (parsed.name) name = parsed.name;
          if (parsed.emoji) emoji = parsed.emoji;
          break;
        } catch {
          // try next path
        }
      }

      // Read SOUL.md for description + capabilities
      const soulPaths = [
        agentWorkspace && path.join(agentWorkspace, "SOUL.md"),
        path.join(agentsDir, agentId, "SOUL.md"),
      ].filter(Boolean) as string[];

      for (const soulPath of soulPaths) {
        try {
          const content = await fs.readFile(soulPath, "utf-8");
          const parsed = parseSoulMd(content);
          if (parsed.description) description = parsed.description;
          if (parsed.capabilities.length) capabilities = parsed.capabilities;
          break;
        } catch {
          // try next path
        }
      }

      // Read defaults.json for model info
      let primaryModel: string | undefined;
      let fallbackModels: string[] | undefined;
      try {
        const defaultsPath = path.join(agentsDir, agentId, "agent", "defaults.json");
        const defaultsRaw = await fs.readFile(defaultsPath, "utf-8");
        const defaults = JSON.parse(defaultsRaw);
        primaryModel = defaults?.defaults?.model?.primary;
        fallbackModels = defaults?.defaults?.model?.fallbacks;
      } catch {
        // defaults.json missing — that's fine
      }

      agents.push({
        id: agentId,
        name,
        emoji,
        color: "", // assigned after sort
        role: "Agent",
        description,
        capabilities,
        hasWorkspace: agentId === "main" || !!agentWorkspace,
        primaryModel,
        fallbackModels,
      });
    }

    // Ensure "main" is always first
    agents.sort((a, b) => {
      if (a.id === "main") return -1;
      if (b.id === "main") return 1;
      return a.id.localeCompare(b.id);
    });

    // Assign colors after sort so main always gets first color
    for (let j = 0; j < agents.length; j++) {
      agents[j].color = COLOR_PALETTE[j % COLOR_PALETTE.length];
    }

    cache = agents;
    cacheTime = now;
    return agents;
  } catch {
    // ~/.openclaw/agents/ doesn't exist → return a single default "main" agent
    const defaultAgents: DiscoveredAgent[] = [
      {
        id: "main",
        name: "Main Agent",
        emoji: "🤖",
        color: COLOR_PALETTE[0],
        role: "Agent",
        description: "",
        capabilities: [],
        hasWorkspace: true,
      },
    ];
    cache = defaultAgents;
    cacheTime = now;
    return defaultAgents;
  }
}

export function invalidateAgentCache() {
  cache = null;
  cacheTime = 0;
}
