import { NextResponse } from "next/server";
import { listDirectory, readFileContent } from "@/lib/workspace";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dir = searchParams.get("dir") || "";
  const file = searchParams.get("file");

  // Read file content
  if (file) {
    const content = await readFileContent(file);
    if (content === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ file, content });
  }

  // List directory
  const entries = await listDirectory(dir);
  return NextResponse.json({ dir, entries });
}
