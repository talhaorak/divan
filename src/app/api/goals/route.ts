import { NextResponse } from "next/server";
import { getGoals, getTodo } from "@/lib/workspace";

export async function GET() {
  const goals = await getGoals();
  const todo = await getTodo();

  return NextResponse.json({ goals, todo });
}
