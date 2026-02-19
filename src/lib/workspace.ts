import fs from "fs/promises";
import path from "path";
import os from "os";
import yaml from "yaml";

export const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), "clawd");

export async function readWorkspaceFile(
  relativePath: string
): Promise<string | null> {
  try {
    const fullPath = path.join(WORKSPACE, relativePath);
    return await fs.readFile(fullPath, "utf-8");
  } catch {
    return null;
  }
}

export async function listMemoryFiles(): Promise<string[]> {
  try {
    const memDir = path.join(WORKSPACE, "memory");
    const files = await fs.readdir(memDir);
    return files.filter((f) => f.endsWith(".md")).sort().reverse();
  } catch {
    return [];
  }
}

export async function getMemoryContent(
  filename: string
): Promise<string | null> {
  return readWorkspaceFile(path.join("memory", filename));
}

export async function getGoals(): Promise<unknown> {
  const content = await readWorkspaceFile("goals.yaml");
  if (!content) return null;
  try {
    return yaml.parse(content);
  } catch {
    return null;
  }
}

export async function getMainMemory(): Promise<string | null> {
  return readWorkspaceFile("MEMORY.md");
}

export async function getIdentity(): Promise<string | null> {
  return readWorkspaceFile("IDENTITY.md");
}

export async function getSoul(): Promise<string | null> {
  return readWorkspaceFile("SOUL.md");
}

export async function getHeartbeat(): Promise<string | null> {
  return readWorkspaceFile("HEARTBEAT.md");
}

export async function getTodo(): Promise<string | null> {
  // Try root TODO.md first, then todo.md
  return (
    (await readWorkspaceFile("TODO.md")) ||
    (await readWorkspaceFile("todo.md"))
  );
}

/* ═══════ FILE BROWSER ═══════ */

export interface FileEntry {
  name: string;
  path: string; // relative to workspace
  type: "file" | "directory";
  size?: number;
  modified?: string;
  extension?: string;
}

export async function listDirectory(relativePath: string = ""): Promise<FileEntry[]> {
  try {
    const fullPath = path.join(WORKSPACE, relativePath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const results: FileEntry[] = [];

    for (const entry of entries) {
      // Skip hidden files, node_modules, .git
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const relPath = path.join(relativePath, entry.name);
      const stat = await fs.stat(path.join(fullPath, entry.name)).catch(() => null);

      results.push({
        name: entry.name,
        path: relPath,
        type: entry.isDirectory() ? "directory" : "file",
        size: stat?.size,
        modified: stat?.mtime?.toISOString(),
        extension: entry.isFile() ? path.extname(entry.name).slice(1) : undefined,
      });
    }

    // Sort: directories first, then files
    return results.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

export async function readFileContent(relativePath: string): Promise<string | null> {
  try {
    const fullPath = path.join(WORKSPACE, relativePath);
    // Security: ensure path is within workspace
    const resolved = path.resolve(fullPath);
    const wsResolved = path.resolve(WORKSPACE);
    if (!resolved.startsWith(wsResolved)) return null;
    return await fs.readFile(fullPath, "utf-8");
  } catch {
    return null;
  }
}

export async function writeFileContent(relativePath: string, content: string): Promise<boolean> {
  try {
    const fullPath = path.join(WORKSPACE, relativePath);
    const resolved = path.resolve(fullPath);
    const wsResolved = path.resolve(WORKSPACE);
    if (!resolved.startsWith(wsResolved)) return false;
    await fs.writeFile(fullPath, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function backupFile(relativePath: string): Promise<string | null> {
  try {
    const fullPath = path.join(WORKSPACE, relativePath);
    const resolved = path.resolve(fullPath);
    const wsResolved = path.resolve(WORKSPACE);
    if (!resolved.startsWith(wsResolved)) return null;

    const content = await fs.readFile(fullPath, "utf-8");
    const backupDir = path.join(WORKSPACE, ".divan-backups");
    await fs.mkdir(backupDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `${path.basename(relativePath, path.extname(relativePath))}_${ts}${path.extname(relativePath)}`;
    const backupPath = path.join(backupDir, backupName);
    await fs.writeFile(backupPath, content, "utf-8");
    return backupName;
  } catch {
    return null;
  }
}

export async function listBackups(filename: string): Promise<string[]> {
  try {
    const backupDir = path.join(WORKSPACE, ".divan-backups");
    const files = await fs.readdir(backupDir);
    const base = path.basename(filename, path.extname(filename));
    return files.filter(f => f.startsWith(base + "_")).sort().reverse();
  } catch {
    return [];
  }
}

export async function restoreBackup(backupName: string, targetRelPath: string): Promise<boolean> {
  try {
    const backupPath = path.join(WORKSPACE, ".divan-backups", backupName);
    const targetPath = path.join(WORKSPACE, targetRelPath);
    const content = await fs.readFile(backupPath, "utf-8");
    await fs.writeFile(targetPath, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

// Parse markdown sections into structured data
export function parseMarkdownSections(
  content: string
): { title: string; content: string; level: number }[] {
  const lines = content.split("\n");
  const sections: { title: string; content: string; level: number }[] = [];
  let current: { title: string; content: string; level: number } | null = null;

  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)/);
    if (match) {
      if (current) sections.push(current);
      current = {
        level: match[1].length,
        title: match[2],
        content: "",
      };
    } else if (current) {
      current.content += line + "\n";
    }
  }
  if (current) sections.push(current);
  return sections;
}
