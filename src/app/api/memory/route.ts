import { NextResponse } from "next/server";
import {
  getMainMemory,
  listMemoryFiles,
  getMemoryContent,
  parseMarkdownSections,
  writeFileContent,
  backupFile,
  listBackups,
  restoreBackup,
  readWorkspaceFile,
} from "@/lib/workspace";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");
  const search = searchParams.get("q");
  const raw = searchParams.get("raw");
  const backups = searchParams.get("backups");

  // List backups for a file
  if (backups) {
    const list = await listBackups(backups);
    return NextResponse.json({ backups: list });
  }

  if (file) {
    const content = await getMemoryContent(file);
    if (!content) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (raw === "1") {
      return NextResponse.json({ file, raw: content });
    }
    return NextResponse.json({
      file,
      sections: parseMarkdownSections(content),
      raw: content,
    });
  }

  const mainMemory = await getMainMemory();
  const files = await listMemoryFiles();

  let sections = mainMemory ? parseMarkdownSections(mainMemory) : [];

  if (search) {
    const q = search.toLowerCase();
    sections = sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q)
    );
  }

  return NextResponse.json({
    mainMemory: { sections, raw: mainMemory },
    files,
  });
}

export async function PUT(request: Request) {
  try {
    const { file, content } = await request.json();
    if (!file || typeof content !== "string") {
      return NextResponse.json({ error: "Missing file or content" }, { status: 400 });
    }

    // Security: only allow memory/ files, MEMORY.md, HEARTBEAT.md, and top-level .md files
    const allowedRoots = ["MEMORY.md", "HEARTBEAT.md", "SOUL.md", "AGENTS.md", "USER.md", "TOOLS.md"];
    const isAllowed = allowedRoots.includes(file) || file.startsWith("memory/") || /^[a-zA-Z0-9_-]+\.md$/.test(file);
    if (!isAllowed) {
      return NextResponse.json({ error: "This file cannot be edited" }, { status: 403 });
    }

    const path = allowedRoots.includes(file) ? file : (file.startsWith("memory/") ? file : `memory/${file}`);

    // Backup first
    const backupName = await backupFile(path);

    // Write
    const ok = await writeFileContent(path, content);
    if (!ok) return NextResponse.json({ error: "Write failed" }, { status: 500 });

    return NextResponse.json({ ok: true, backup: backupName });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, backupName, targetFile } = await request.json();

    if (action === "restore" && backupName && targetFile) {
      const path = targetFile === "MEMORY.md" ? "MEMORY.md" : (targetFile.startsWith("memory/") ? targetFile : `memory/${targetFile}`);
      const ok = await restoreBackup(backupName, path);
      return NextResponse.json({ ok });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
