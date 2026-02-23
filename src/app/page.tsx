"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import AgentCard from "@/components/AgentCard";
import ActivityFeed from "@/components/ActivityFeed";
import MemoryPreview from "@/components/MemoryPreview";
import QuickStats from "@/components/QuickStats";
import { useLanguage } from "@/contexts/LanguageContext";

const DivanScene = dynamic(() => import("@/components/DivanScene"), {
  ssr: false,
});

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface ProfileInfo {
  profileId: string;
  provider: string;
  type: string;
  status: "ok" | "cooldown" | "disabled";
  cooldownUntil?: number;
  cooldownRemainingMs?: number;
  disabledReason?: string;
  errorCount: number;
  lastFailureAt?: number;
  failureCounts: Record<string, number>;
  isLastGood: boolean;
  lastErrorText?: string;
  hasCredential: boolean;
  maskedCredential?: string;
}

interface AgentDef {
  id: string;
  name: string;
  emoji: string;
  role: string;
  description: string;
  status: "active" | "idle" | "standby" | "sleeping";
  color: string;
  activeSessions?: number;
  lastSeen?: string;
  primaryModel?: string;
  fallbackModels?: string[];
}

interface GatewayData {
  health: { ok: boolean; latencyMs: number };
  agents: Record<string, { status: string; lastSeen: number; activeSessions: number }>;
  cronJobs: { id: string; name: string; enabled: boolean; lastStatus: string }[];
}

type SceneMode = "compact" | "immersive";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const toolRoutes: Record<string, string> = {
  terminal: "/tasks",
  files: "/memory",
  internet: "/",
  memory: "/memory",
  agents: "/team",
  comms: "/team",
};

// ─── Profile row (needs own hook scope for countdown) ─────────────────────────

function ProfileRowInspect({
  profile: p,
  agentId,
  resetState,
  onReset,
}: {
  profile: ProfileInfo;
  agentId: string;
  resetState: "idle" | "loading" | "done";
  onReset: (agentId: string, profileId: string) => void;
}) {
  const isBad = p.status !== "ok";
  const [remaining, setRemaining] = useState(p.cooldownRemainingMs ?? 0);

  useEffect(() => {
    if (p.status !== "cooldown" || !p.cooldownUntil) return;
    const tick = () => setRemaining(Math.max(0, p.cooldownUntil! - Date.now()));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [p.status, p.cooldownUntil]);

  return (
    <div className={`rounded-lg border p-3 ${isBad ? "border-amber-500/30 bg-amber-500/5" : "border-[#2a2a3e] bg-[#12121a]/60"}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
            p.status === "ok"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : p.status === "cooldown"
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}>{p.status}</span>
          <span className="text-[10px] text-[#e8e6e3] font-medium">{p.provider}</span>
          {p.isLastGood && <span className="text-[9px] text-violet-400">★ last-good</span>}
          {p.maskedCredential && (
            <span className="text-[9px] text-[#6b7280] font-mono">{p.maskedCredential}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isBad && (
            <button
              disabled={resetState !== "idle"}
              onClick={() => onReset(agentId, p.profileId)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                resetState === "done"
                  ? "border-emerald-500/30 text-emerald-400"
                  : resetState === "loading"
                    ? "border-[#2a2a3e] text-[#6b7280] opacity-50"
                    : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10 cursor-pointer"
              }`}
            >
              {resetState === "done" ? "✓ Reset" : resetState === "loading" ? "Resetting…" : "Reset Cooldown"}
            </button>
          )}
        </div>
      </div>
      {p.status === "cooldown" && remaining > 0 && (
        <div className="mt-1.5 text-[10px] text-amber-400">
          ⏱ Kalan: <span className="font-mono font-semibold">{formatCountdown(remaining)}</span>
        </div>
      )}
      {p.lastErrorText && (
        <div className="mt-1.5 text-[10px] text-red-400/80 font-mono break-all">{p.lastErrorText}</div>
      )}
      {p.errorCount > 0 && (
        <div className="mt-1 text-[9px] text-[#6b7280]">
          Toplam hata: {p.errorCount}
          {p.lastFailureAt && <> · Son hata: {new Date(p.lastFailureAt).toLocaleString("tr-TR")}</>}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DivanPage() {
  const router = useRouter();
  const { t, relativeTime, language } = useLanguage();

  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [gatewayOk, setGatewayOk] = useState<boolean | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [cronCount, setCronCount] = useState(0);
  const [sceneMode, setSceneMode] = useState<SceneMode>("compact");
  const [focusedName, setFocusedName] = useState<string | null>(null);

  // Tool Inspect modal
  const [toolInspect, setToolInspect] = useState<{ stationId: string; open: boolean } | null>(null);
  const [toolTrace, setToolTrace] = useState<any>(null);
  const [toolTraceLoading, setToolTraceLoading] = useState(false);

  // Agent Inspector modal (cooldown / model / error)
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo[]>>({});
  const [agentInspect, setAgentInspect] = useState<{ agentId: string } | null>(null);
  const [resetState, setResetState] = useState<Record<string, "idle" | "loading" | "done">>({});

  // ── Fetch agents (with model info) ──
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.agents)) {
          setAgents(
            data.agents.map((a: AgentDef) => ({
              id: a.id,
              name: a.name,
              emoji: a.emoji,
              role: a.role || t("agent.defaultRole"),
              description: a.description || t("agent.defaultDescription"),
              status: "standby" as const,
              color: a.color,
              primaryModel: a.primaryModel,
              fallbackModels: a.fallbackModels,
            }))
          );
        }
      })
      .catch(() => {
        setAgents([{
          id: "main",
          name: "Main Agent",
          emoji: "🤖",
          role: t("agent.defaultRole"),
          description: t("agent.defaultDescription"),
          status: "standby",
          color: "#dc2626",
        }]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch profiles (cooldown / error info) every 15s ──
  const fetchProfiles = useCallback(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data) => {
        if (data.agents) setProfiles(data.agents as Record<string, ProfileInfo[]>);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchProfiles();
    const iv = setInterval(fetchProfiles, 15000);
    return () => clearInterval(iv);
  }, [fetchProfiles]);

  // ── Tool inspect ──
  const inspectTool = useCallback(async (stationId: string) => {
    setToolInspect({ stationId, open: true });
    setToolTraceLoading(true);
    try {
      const res = await fetch(`/api/tooltrace?agent=all&category=${encodeURIComponent(stationId)}&limit=25`);
      const data = await res.json();
      setToolTrace(data);
    } catch {
      setToolTrace(null);
    }
    setToolTraceLoading(false);
  }, []);

  // ── Agent inspect ──
  const inspectAgent = useCallback((agentId: string) => {
    setAgentInspect({ agentId });
    fetchProfiles(); // refresh on open
  }, [fetchProfiles]);

  // ── Reset cooldown ──
  const handleResetCooldown = useCallback(async (agentId: string, profileId: string) => {
    const key = `${agentId}:${profileId}`;
    setResetState((s) => ({ ...s, [key]: "loading" }));
    try {
      await fetch("/api/profiles/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, profileId }),
      });
      setResetState((s) => ({ ...s, [key]: "done" }));
      setTimeout(() => {
        setResetState((s) => ({ ...s, [key]: "idle" }));
        fetchProfiles();
      }, 2000);
    } catch {
      setResetState((s) => ({ ...s, [key]: "idle" }));
    }
  }, [fetchProfiles]);

  // ── Gateway poll ──
  const handleDoubleClick = useCallback(
    (type: "agent" | "tool", name: string) => {
      if (type === "agent") router.push("/team");
      else router.push(toolRoutes[name] || "/");
    },
    [router]
  );

  const fetchGateway = useCallback(() => {
    fetch("/api/gateway")
      .then((r) => r.json())
      .then((data: GatewayData) => {
        setGatewayOk(data.health?.ok ?? false);
        setLatency(data.health?.latencyMs ?? null);
        setCronCount(data.cronJobs?.length ?? 0);
        if (data.agents) {
          setAgents((prev) =>
            prev.map((a) => {
              const live = data.agents[a.id];
              if (!live) return a;
              return {
                ...a,
                status: live.status as AgentDef["status"],
                activeSessions: live.activeSessions,
                lastSeen: live.lastSeen ? relativeTime(live.lastSeen) : undefined,
              };
            })
          );
        }
      })
      .catch(() => setGatewayOk(false));
  }, [relativeTime]);

  useEffect(() => {
    fetchGateway();
    const interval = setInterval(fetchGateway, 15000);
    return () => clearInterval(interval);
  }, [fetchGateway]);

  // ESC exits immersive mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sceneMode === "immersive" && !focusedName) setSceneMode("compact");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sceneMode, focusedName]);

  // ── Build scene agents with cooldown state merged in ──
  const sceneAgents = agents.map((a) => {
    const agProfiles = profiles[a.id] || [];
    const cooldownCount = agProfiles.filter((p) => p.status !== "ok").length;
    const worstProfile = agProfiles.find((p) => p.status !== "ok");
    return {
      id: a.id,
      name: a.name,
      status: a.status,
      color: a.color,
      position: [0, 0, 0] as [number, number, number],
      cooldownCount,
      primaryModel: a.primaryModel,
      lastErrorText: worstProfile?.lastErrorText,
      cooldownRemainingMs: worstProfile?.cooldownRemainingMs,
    };
  });

  const isImmersive = sceneMode === "immersive";

  // ── Agent inspector modal data ──
  const inspectedAgent = agentInspect ? agents.find((a) => a.id === agentInspect.agentId) : null;
  const inspectedProfiles = agentInspect ? (profiles[agentInspect.agentId] || []) : [];
  const inspectedCooldownProfiles = inspectedProfiles.filter((p) => p.status !== "ok");

  return (
    <div className="min-h-screen">

      {/* ── Tool Inspect Modal ── */}
      <AnimatePresence>
        {toolInspect?.open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setToolInspect(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              className="w-[min(980px,95vw)] max-h-[80vh] overflow-hidden rounded-2xl border border-[#2a2a3e] bg-[#0f0f16]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-[#2a2a3e] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#e8e6e3]">Tool Trace: {toolInspect.stationId}</h3>
                  <p className="text-[10px] text-[#6b7280]">Son 10 dk — agent=all</p>
                </div>
                <button
                  className="text-[10px] px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] text-[#6b7280]"
                  onClick={() => setToolInspect(null)}
                >Kapat</button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[calc(80vh-56px)]">
                {toolTraceLoading ? (
                  <div className="text-xs text-[#6b7280]">Yükleniyor...</div>
                ) : toolTrace?.byAgent ? (
                  <div className="space-y-4">
                    {Object.entries(toolTrace.byAgent as Record<string, any[]>).map(([agentId, events]) => (
                      <div key={agentId} className="rounded-xl border border-[#2a2a3e] bg-[#12121a]/70">
                        <div className="px-3 py-2 border-b border-[#2a2a3e] flex items-center justify-between">
                          <div className="text-[11px] text-[#e8e6e3] font-medium">@{agentId}</div>
                          <div className="text-[10px] text-[#6b7280]">{Array.isArray(events) ? events.length : 0} event</div>
                        </div>
                        <div className="p-3 space-y-2">
                          {Array.isArray(events) && events.length ? (
                            events.map((e, idx) => (
                              <details key={idx} className="rounded-lg border border-[#2a2a3e] bg-[#0b0b12] p-2">
                                <summary className="cursor-pointer text-[11px] text-[#9ca3af]">
                                  <span className="text-[#d4a017]">{e.tool}</span>
                                  {e.command ? <span className="ml-2 text-[#6b7280]">{e.command.slice(0, 80)}</span> : null}
                                  {e.url ? <span className="ml-2 text-[#6b7280]">{e.url}</span> : null}
                                  {typeof e.status === "number" ? <span className="ml-2 text-[#6b7280]">HTTP {e.status}</span> : null}
                                  {e.isError ? <span className="ml-2 text-red-400">error</span> : null}
                                </summary>
                                <pre className="mt-2 text-[10px] text-[#9ca3af] whitespace-pre-wrap font-mono">{e.resultRaw || "(no result yet)"}</pre>
                              </details>
                            ))
                          ) : (
                            <div className="text-[11px] text-[#6b7280]">Bu pencerede event yok.</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[#6b7280]">Trace bulunamadı.</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Agent Inspector Modal ── */}
      <AnimatePresence>
        {agentInspect && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setAgentInspect(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              className="w-[min(620px,95vw)] rounded-2xl border border-[#2a2a3e] bg-[#0f0f16] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`px-4 py-3 border-b flex items-center justify-between ${inspectedCooldownProfiles.length > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-[#2a2a3e]"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{inspectedAgent?.emoji || "🤖"}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-[#e8e6e3]">{inspectedAgent?.name || agentInspect.agentId}</h3>
                    {inspectedCooldownProfiles.length > 0 && (
                      <p className="text-[10px] text-amber-400 animate-pulse">
                        ⚠ {inspectedCooldownProfiles.length} profil cooldown/disabled
                      </p>
                    )}
                  </div>
                </div>
                <button
                  className="text-[10px] px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] text-[#6b7280]"
                  onClick={() => setAgentInspect(null)}
                >Kapat</button>
              </div>

              <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Model Info */}
                <div>
                  <div className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-2">Model</div>
                  {inspectedAgent?.primaryModel ? (
                    <div className="flex flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#12121a] border border-violet-500/25">
                        <span className="text-[9px] text-violet-400 uppercase font-semibold">Primary</span>
                        <span className="text-[10px] text-[#c9c7c1] font-mono">{inspectedAgent.primaryModel}</span>
                      </div>
                      {(inspectedAgent.fallbackModels || []).map((m) => (
                        <div key={m} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#12121a] border border-[#2a2a3e]">
                          <span className="text-[9px] text-[#6b7280] uppercase font-semibold">Fallback</span>
                          <span className="text-[10px] text-[#9ca3af] font-mono">{m}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#6b7280]">Model bilgisi yok</p>
                  )}
                </div>

                {/* Auth Profiles */}
                <div>
                  <div className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-2">
                    Auth Profilleri ({inspectedProfiles.length})
                  </div>
                  {inspectedProfiles.length === 0 ? (
                    <p className="text-xs text-[#6b7280]">Profil bulunamadı</p>
                  ) : (
                    <div className="space-y-2">
                      {inspectedProfiles.map((p) => {
                        const key = `${agentInspect.agentId}:${p.profileId}`;
                        return (
                          <ProfileRowInspect
                            key={p.profileId}
                            profile={p}
                            agentId={agentInspect.agentId}
                            resetState={resetState[key] || "idle"}
                            onReset={handleResetCooldown}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 3D Scene ── */}
      <motion.div
        className="relative overflow-hidden"
        animate={{ height: isImmersive ? "calc(100vh - 56px)" : "45vh" }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="absolute inset-0">
          <DivanScene
            agents={sceneAgents}
            onFocusChange={setFocusedName}
            onDoubleClick={handleDoubleClick}
            onToolInspect={inspectTool}
            onAgentInspect={inspectAgent}
          />
        </div>

        <AnimatePresence>
          {!isImmersive && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0f] to-transparent pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Header overlay */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-6">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#d4a017] tracking-wide drop-shadow-lg">{t("home.pageTitle")}</h1>
              <p className="text-sm text-[#9ca3af]/80 mt-1 drop-shadow">{t("home.subtitle")}</p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs text-[#9ca3af]/80 drop-shadow">
                {new Date().toLocaleDateString(language === "tr" ? "tr-TR" : "en-US", {
                  weekday: "long", year: "numeric", month: "long", day: "numeric",
                })}
              </p>
              <div className="flex items-center gap-2 justify-end">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${gatewayOk === null ? "bg-gray-500 animate-pulse" : gatewayOk ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`} />
                  <span className="text-[10px] text-[#9ca3af]/70 drop-shadow">
                    {gatewayOk === null ? t("home.connecting") : gatewayOk ? `Gateway ${latency ? `(${latency}ms)` : "✓"}` : t("home.disconnected")}
                  </span>
                </div>
                {cronCount > 0 && <span className="text-[10px] text-[#9ca3af]/70 drop-shadow">• {cronCount} cron</span>}
              </div>
              <button
                onClick={() => setSceneMode(isImmersive ? "compact" : "immersive")}
                className="mt-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all duration-200 border"
                style={{
                  borderColor: isImmersive ? "#d4a01750" : "#2a2a3e",
                  backgroundColor: isImmersive ? "#d4a01715" : "#12121a80",
                  color: isImmersive ? "#d4a017" : "#6b7280",
                }}
              >
                {isImmersive ? t("home.immersive") : t("home.expand")}
              </button>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* ── Dashboard ── */}
      <AnimatePresence>
        {!isImmersive && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 max-w-7xl mx-auto px-6 -mt-8 pb-12 space-y-6"
          >
            <QuickStats />
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-4">
                <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">{t("home.sectionTeam")}</h2>
                <div className={`grid gap-3 ${agents.length === 1 ? "grid-cols-1 max-w-sm" : agents.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {agents.map((agent, i) => {
                    const { id: _id, activeSessions: _as, lastSeen: _ls, primaryModel: _pm, fallbackModels: _fm, ...cardProps } = agent;
                    return <AgentCard key={agent.id} {...cardProps} index={i} />;
                  })}
                </div>
                <MemoryPreview />
              </div>
              <div className="space-y-4">
                <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">{t("home.sectionFeed")}</h2>
                <ActivityFeed />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
