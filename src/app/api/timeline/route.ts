import { NextResponse } from "next/server";
import { listMemoryFiles, getMemoryContent, parseMarkdownSections } from "@/lib/workspace";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "7");

  const files = await listMemoryFiles();
  // Daily files are YYYY-MM-DD.md
  const dailyFiles = files
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .slice(0, limit);

  const timeline = await Promise.all(
    dailyFiles.map(async (file) => {
      const content = await getMemoryContent(file);
      const date = file.replace(".md", "");
      return {
        date,
        file,
        sections: content ? parseMarkdownSections(content) : [],
        preview: content ? content.slice(0, 500) : "",
      };
    })
  );

  return NextResponse.json({ timeline });
}
