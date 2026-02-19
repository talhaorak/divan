import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

const CRON_FILE = path.join(process.env.HOME || os.homedir(), ".openclaw/cron/jobs.json");

async function readCronJobs() {
  try {
    const content = await fs.readFile(CRON_FILE, "utf-8");
    const data = JSON.parse(content);
    return data.jobs || [];
  } catch {
    return [];
  }
}

export async function GET() {
  const jobs = await readCronJobs();
  return NextResponse.json({ jobs });
}

// Mutations are implemented by shelling out to `openclaw cron ...`.
// This is safe in the Divan operator UI context (local machine), and avoids
// wiring a write-capable GW WS client in the browser.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body as { action?: string };

    if (action === "runs") {
      const jobs = await readCronJobs();
      const job = jobs.find((j: { id: string }) => j.id === (body as { jobId?: string }).jobId);
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
      return NextResponse.json({ lastRun: job.state || null });
    }

    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    // Helper: run openclaw with a short timeout and return stdout+stderr.
    const run = async (cmd: string) => {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 20_000 });
      return { stdout, stderr };
    };

    if (action === "run") {
      const { jobId } = body as { jobId?: string };
      if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
      await run(`openclaw cron run ${escapeArg(jobId)} --timeout 30000`);
      return NextResponse.json({ ok: true });
    }

    if (action === "enable" || action === "disable") {
      const { jobId } = body as { jobId?: string };
      if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
      await run(`openclaw cron ${action} ${escapeArg(jobId)} --timeout 30000`);
      return NextResponse.json({ ok: true });
    }

    if (action === "rm") {
      const { jobId } = body as { jobId?: string };
      if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
      await run(`openclaw cron rm ${escapeArg(jobId)} --timeout 30000`);
      return NextResponse.json({ ok: true });
    }

    if (action === "edit") {
      const { jobId, patch } = body as { jobId?: string; patch?: Record<string, unknown> };
      if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
      if (!patch || typeof patch !== "object") return NextResponse.json({ error: "Missing patch" }, { status: 400 });

      // Supported patch keys (minimal set for now)
      const args: string[] = [];
      if (typeof patch.name === "string") args.push(`--name ${escapeArg(patch.name)}`);
      if (typeof patch.agentId === "string") args.push(`--agent ${escapeArg(patch.agentId)}`);
      if (typeof patch.sessionTarget === "string") args.push(`--session ${escapeArg(patch.sessionTarget)}`);
      if (typeof patch.model === "string") args.push(`--model ${escapeArg(patch.model)}`);
      if (typeof patch.timeoutSeconds === "number") args.push(`--timeout-seconds ${Math.max(1, Math.floor(patch.timeoutSeconds))}`);

      // schedule
      if (typeof patch.cron === "string") args.push(`--cron ${escapeArg(patch.cron)}`);
      if (typeof patch.every === "string") args.push(`--every ${escapeArg(patch.every)}`);
      if (typeof patch.at === "string") args.push(`--at ${escapeArg(patch.at)}`);
      if (typeof patch.tz === "string") args.push(`--tz ${escapeArg(patch.tz)}`);

      // payload
      if (typeof patch.message === "string") args.push(`--message ${escapeArg(patch.message)}`);
      if (typeof patch.systemEvent === "string") args.push(`--system-event ${escapeArg(patch.systemEvent)}`);

      // enabled
      if (patch.enabled === true) args.push(`--enable`);
      if (patch.enabled === false) args.push(`--disable`);

      await run(`openclaw cron edit ${escapeArg(jobId)} ${args.join(" ")} --timeout 30000`);
      return NextResponse.json({ ok: true });
    }

    if (action === "add") {
      const { job } = body as { job?: Record<string, unknown> };
      if (!job || typeof job !== "object") return NextResponse.json({ error: "Missing job" }, { status: 400 });

      const args: string[] = [];
      if (typeof job.name === "string") args.push(`--name ${escapeArg(job.name)}`);
      if (typeof job.agentId === "string") args.push(`--agent ${escapeArg(job.agentId)}`);
      if (typeof job.sessionTarget === "string") args.push(`--session ${escapeArg(job.sessionTarget)}`);
      if (typeof job.model === "string") args.push(`--model ${escapeArg(job.model)}`);
      if (typeof job.timeoutSeconds === "number") args.push(`--timeout-seconds ${Math.max(1, Math.floor(job.timeoutSeconds))}`);

      // schedule (one of cron|every|at)
      if (typeof job.cron === "string") args.push(`--cron ${escapeArg(job.cron)}`);
      if (typeof job.every === "string") args.push(`--every ${escapeArg(job.every)}`);
      if (typeof job.at === "string") args.push(`--at ${escapeArg(job.at)}`);
      if (typeof job.tz === "string") args.push(`--tz ${escapeArg(job.tz)}`);

      // payload
      if (typeof job.message === "string") args.push(`--message ${escapeArg(job.message)}`);
      if (typeof job.systemEvent === "string") args.push(`--system-event ${escapeArg(job.systemEvent)}`);

      if (job.enabled === false) args.push(`--disabled`);

      const { stdout } = await run(`openclaw cron add ${args.join(" ")} --json --timeout 30000`);
      try {
        return NextResponse.json({ ok: true, job: JSON.parse(stdout) });
      } catch {
        return NextResponse.json({ ok: true });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function escapeArg(v: unknown): string {
  // Minimal shell escaping: wrap in single quotes and escape existing single quotes.
  const s = String(v ?? "");
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

