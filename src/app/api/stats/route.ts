import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import yaml from "yaml";

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), ".openclaw", "workspace");

export async function GET() {
  // 1. Memory file count
  let memoryFiles = 0;
  try {
    const memDir = path.join(WORKSPACE, "memory");
    const files = await fs.readdir(memDir);
    memoryFiles = files.filter((f) => f.endsWith(".md")).length;
  } catch {
    // ignore
  }

  // 2. Goal count from goals.yaml
  let goalCount = 0;
  try {
    const raw = await fs.readFile(path.join(WORKSPACE, "goals.yaml"), "utf-8");
    const parsed = yaml.parse(raw);
    goalCount = countGoals(parsed);
  } catch {
    // ignore
  }

  // 3. Cron jobs — read from ~/.openclaw/cron/jobs.json
  let cronCount = 0;
  try {
    const cronFile = path.join(os.homedir(), ".openclaw", "cron", "jobs.json");
    const raw = await fs.readFile(cronFile, "utf-8");
    const data = JSON.parse(raw);
    cronCount = Array.isArray(data.jobs) ? data.jobs.length : 0;
  } catch {
    // ignore
  }

  // 4. Active jobs count
  let activeJobs = 0;
  try {
    const raw = await fs.readFile(
      path.join(WORKSPACE, "memory/jobs/state.json"),
      "utf-8"
    );
    const state = JSON.parse(raw);
    activeJobs = state.activeCount || 0;
  } catch {
    // ignore
  }

  // 5. Last heartbeat — check most recent memory file timestamp
  let lastActivityAt = 0;
  try {
    const memDir = path.join(WORKSPACE, "memory");
    const files = await fs.readdir(memDir);
    const mdFiles = files.filter((f) => f.match(/^\d{4}-\d{2}-\d{2}\.md$/));
    mdFiles.sort().reverse();
    if (mdFiles.length > 0) {
      const stat = await fs.stat(path.join(memDir, mdFiles[0]));
      lastActivityAt = stat.mtimeMs;
    }
  } catch {
    // ignore
  }

  // 6. Workspace git status
  let uncommittedChanges = 0;
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(
      `cd "${WORKSPACE}" && git status --porcelain | wc -l`
    );
    uncommittedChanges = parseInt(stdout.trim()) || 0;
  } catch {
    // ignore
  }

  return NextResponse.json({
    memoryFiles,
    goalCount,
    cronCount,
    activeJobs,
    lastActivityAt,
    uncommittedChanges,
    timestamp: Date.now(),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function countGoals(obj: any): number {
  if (!obj || typeof obj !== "object") return 0;
  let count = 0;
  if (Array.isArray(obj)) {
    for (const item of obj) count += countGoals(item);
  } else {
    if (obj.name || obj.goal || obj.title) count = 1;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "object") count += countGoals(obj[key]);
    }
  }
  return count;
}
