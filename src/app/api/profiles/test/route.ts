import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

interface TestBody {
  /** If provided, loads credential from saved profile */
  agentId?: string;
  profileId?: string;
  /** Inline credentials (used when testing unsaved form values) */
  provider?: string;
  type?: string;
  credential?: string;
}

interface TestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
  detail?: string;
}

const TIMEOUT_MS = 7000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function testAnthropicToken(token: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": token,
        "anthropic-version": "2023-06-01",
      },
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { ok: true, message: "Auth OK — Anthropic API reachable", latencyMs };
    if (res.status === 401) return { ok: false, message: "Auth failed — invalid token", latencyMs };
    if (res.status === 429) {
      return {
        ok: true,
        message: "Token valid (rate limited — 429)",
        latencyMs,
        detail: "The token is authenticated, but you are currently rate limited.",
      };
    }
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const errMsg = (body as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
    return { ok: false, message: errMsg, latencyMs };
  } catch (err) {
    const msg = String(err);
    if (msg.includes("abort")) return { ok: false, message: "Request timed out" };
    return { ok: false, message: msg };
  }
}

async function testOpenRouterKey(key: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { ok: true, message: "Auth OK — OpenRouter API reachable", latencyMs };
    if (res.status === 401) return { ok: false, message: "Auth failed — invalid key", latencyMs };
    return { ok: false, message: `HTTP ${res.status}`, latencyMs };
  } catch (err) {
    return { ok: false, message: String(err).includes("abort") ? "Request timed out" : String(err) };
  }
}

async function testOpenAiToken(token: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { ok: true, message: "Auth OK — OpenAI API reachable", latencyMs };
    if (res.status === 401) return { ok: false, message: "Auth failed — invalid token", latencyMs };
    if (res.status === 429) return { ok: true, message: "Token valid (rate limited — 429)", latencyMs };
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    return { ok: false, message: body.error?.message || `HTTP ${res.status}`, latencyMs };
  } catch (err) {
    return { ok: false, message: String(err).includes("abort") ? "Request timed out" : String(err) };
  }
}

async function testGithubCopilotToken(token: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      const user = await res.json().catch(() => ({})) as { login?: string };
      return {
        ok: true,
        message: `Auth OK — GitHub user: ${user.login || "(unknown)"}`,
        latencyMs,
      };
    }
    if (res.status === 401) return { ok: false, message: "Auth failed — invalid token", latencyMs };
    return { ok: false, message: `HTTP ${res.status}`, latencyMs };
  } catch (err) {
    return { ok: false, message: String(err).includes("abort") ? "Request timed out" : String(err) };
  }
}

async function testGoogleOAuth(accessToken: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const latencyMs = Date.now() - start;
    if (res.ok) return { ok: true, message: "Auth OK — Google AI API reachable", latencyMs };
    if (res.status === 401) return { ok: false, message: "Auth failed — token invalid or expired", latencyMs };
    return { ok: false, message: `HTTP ${res.status}`, latencyMs };
  } catch (err) {
    return { ok: false, message: String(err).includes("abort") ? "Request timed out" : String(err) };
  }
}

async function dispatchTest(provider: string, type: string, credential: string): Promise<TestResult> {
  switch (provider) {
    case "anthropic":
      return testAnthropicToken(credential);
    case "openrouter":
      return testOpenRouterKey(credential);
    case "openai":
    case "openai-codex":
      return testOpenAiToken(credential);
    case "github-copilot":
      return testGithubCopilotToken(credential);
    case "google-gemini-cli":
    case "google-antigravity":
      if (type === "oauth") return testGoogleOAuth(credential);
      return { ok: false, message: "Test not supported for this provider/type combination" };
    default:
      return { ok: false, message: `Test not supported for provider: ${provider}` };
  }
}

export async function POST(request: NextRequest) {
  let body: TestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let provider: string;
  let type: string;
  let credential: string;

  if (body.agentId && body.profileId) {
    // Load from saved profile
    const { agentId, profileId } = body;
    if (!/^[a-z0-9_-]+$/.test(agentId!)) {
      return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
    }
    const profilesPath = path.join(
      os.homedir(),
      ".openclaw",
      "agents",
      agentId!,
      "agent",
      "auth-profiles.json"
    );
    try {
      const raw = await fs.readFile(profilesPath, "utf-8");
      const data = JSON.parse(raw);
      const prof = data.profiles?.[profileId!] as Record<string, string> | undefined;
      if (!prof) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      provider = prof.provider;
      type = prof.type;
      credential = (prof.token ?? prof.key ?? prof.access) as string;
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  } else {
    // Inline credentials from form
    if (!body.provider || !body.type || !body.credential) {
      return NextResponse.json(
        { error: "Either (agentId+profileId) or (provider+type+credential) must be provided" },
        { status: 400 }
      );
    }
    provider = body.provider;
    type = body.type;
    credential = body.credential;
  }

  if (!credential) {
    return NextResponse.json({ ok: false, message: "No credential to test" });
  }

  const result = await dispatchTest(provider, type, credential);
  return NextResponse.json(result);
}
