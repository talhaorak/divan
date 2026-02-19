import { NextResponse } from "next/server";
import { listDirectory, readFileContent } from "@/lib/workspace";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get("agent") || "main";
  const dir = searchParams.get("dir") || "";
  const file = searchParams.get("file");

  // Resolve relative path under workspace or agent workspace
  const prefix = agent && agent !== "main" ? `agents/${agent}/workspace/` : "";

  // Read file content
  if (file) {
    const content = await readFileContent(prefix + file);
    if (content === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ file, content, agent });
  }

  // List directory
  const entries = await listDirectory(prefix + dir);
  return NextResponse.json({ dir, entries, agent });
}
