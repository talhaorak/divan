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

// For mutations, we use the cron tool through gateway WS. For now, read-only via file.
// Client-side actions (run, toggle, etc.) should go through the main session.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "runs") {
      // Just return the last run info from the job itself
      const jobs = await readCronJobs();
      const job = jobs.find((j: { id: string }) => j.id === body.jobId);
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
      return NextResponse.json({ lastRun: job.state || null });
    }

    // For run/update/add/remove: these require gateway WS protocol
    // Return helpful error
    return NextResponse.json({
      error: "Cron mutations require gateway WebSocket. Use the agent chat to modify cron jobs.",
      hint: "Example: tell your agent to 'disable cron job X' or 'run cron job Y'"
    }, { status: 501 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
