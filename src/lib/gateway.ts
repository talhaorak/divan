import WebSocket from "ws";
import crypto from "crypto";

const GW_URL = process.env.OPENCLAW_GATEWAY_URL || "ws://127.0.0.1:18009";
const GW_HTTP = process.env.OPENCLAW_GATEWAY_HTTP || "http://127.0.0.1:18009";
const GW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";

// Simple request-response over WS
export async function gwRequest(
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(GW_URL);
    const reqId = crypto.randomUUID();
    let connected = false;
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Gateway WS timeout"));
    }, 10000);

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        // Handle challenge
        if (
          msg.type === "event" &&
          msg.event === "connect.challenge" &&
          !connected
        ) {
          connected = true;
          ws.send(
            JSON.stringify({
              type: "req",
              id: "connect-" + reqId,
              method: "connect",
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: "divan-dashboard",
                  version: "0.1.0",
                  platform: "web",
                  mode: "operator",
                },
                role: "operator",
                scopes: ["operator.read"],
                caps: [],
                commands: [],
                permissions: {},
                auth: { token: GW_TOKEN },
                locale: "tr-TR",
                userAgent: "divan/0.1.0",
              },
            })
          );
          return;
        }

        // Handle connect response
        if (msg.type === "res" && msg.id === "connect-" + reqId) {
          if (!msg.ok) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error("Connect failed: " + JSON.stringify(msg.error)));
            return;
          }
          // Now send our actual request
          ws.send(
            JSON.stringify({
              type: "req",
              id: reqId,
              method,
              params,
            })
          );
          return;
        }

        // Handle our request response
        if (msg.type === "res" && msg.id === reqId) {
          clearTimeout(timeout);
          ws.close();
          if (msg.ok) {
            resolve(msg.payload);
          } else {
            reject(new Error(JSON.stringify(msg.error)));
          }
          return;
        }
      } catch (e) {
        // parse error, ignore
      }
    });

    ws.on("error", (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on("close", () => {
      clearTimeout(timeout);
    });
  });
}

// HTTP health check (simpler, no WS needed)
export async function gwHealth(): Promise<{
  ok: boolean;
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    const res = await fetch(`${GW_HTTP}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return { ok: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

// Get sessions list via openclaw CLI (most reliable)
export async function gwSessions(): Promise<unknown> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  try {
    const { stdout } = await execAsync("openclaw sessions --json 2>/dev/null", {
      timeout: 5000,
    });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}
