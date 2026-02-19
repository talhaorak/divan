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
}

interface GatewayData {
  health: { ok: boolean; latencyMs: number };
  agents: Record<
    string,
    { status: string; lastSeen: number; activeSessions: number }
  >;
  cronJobs: { id: string; name: string; enabled: boolean; lastStatus: string }[];
}

type SceneMode = "compact" | "immersive";

const toolRoutes: Record<string, string> = {
  terminal: "/tasks",
  files: "/memory",
  internet: "/",
  memory: "/memory",
  agents: "/team",
  comms: "/team",
};

export default function DivanPage() {
  const router = useRouter();
  const { t, relativeTime, language } = useLanguage();

  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [gatewayOk, setGatewayOk] = useState<boolean | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [cronCount, setCronCount] = useState(0);
  const [sceneMode, setSceneMode] = useState<SceneMode>("compact");
  const [focusedName, setFocusedName] = useState<string | null>(null);

  // Fetch discovered agents on mount
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.agents)) {
          setAgents(
            data.agents.map(
              (a: {
                id: string;
                name: string;
                emoji: string;
                color: string;
                role: string;
                description: string;
              }) => ({
                id: a.id,
                name: a.name,
                emoji: a.emoji,
                role: a.role || t("agent.defaultRole"),
                description: a.description || t("agent.defaultDescription"),
                status: "standby" as const,
                color: a.color,
              })
            )
          );
        }
      })
      .catch(() => {
        // Fallback single agent
        setAgents([
          {
            id: "main",
            name: "Main Agent",
            emoji: "🤖",
            role: t("agent.defaultRole"),
            description: t("agent.defaultDescription"),
            status: "standby",
            color: "#dc2626",
          },
        ]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  const handleDoubleClick = useCallback(
    (type: "agent" | "tool", name: string) => {
      if (type === "agent") {
        router.push("/team");
      } else {
        router.push(toolRoutes[name] || "/");
      }
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
                status: live.status as "active" | "idle" | "standby" | "sleeping",
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
      if (e.key === "Escape" && sceneMode === "immersive" && !focusedName) {
        setSceneMode("compact");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sceneMode, focusedName]);

  const sceneAgents = agents.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    color: a.color,
    position: [0, 0, 0] as [number, number, number],
  }));

  const isImmersive = sceneMode === "immersive";

  return (
    <div className="min-h-screen">
      {/* ===== 3D Scene ===== */}
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
          />
        </div>

        {/* Gradient fade (compact only) */}
        <AnimatePresence>
          {!isImmersive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0f] to-transparent pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Header overlay */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-6">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-end justify-between"
          >
            <div>
              <h1 className="text-3xl font-bold text-[#d4a017] tracking-wide drop-shadow-lg">
                {t("home.pageTitle")}
              </h1>
              <p className="text-sm text-[#9ca3af]/80 mt-1 drop-shadow">
                {t("home.subtitle")}
              </p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs text-[#9ca3af]/80 drop-shadow">
                {new Date().toLocaleDateString(language === "tr" ? "tr-TR" : "en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <div className="flex items-center gap-2 justify-end">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      gatewayOk === null
                        ? "bg-gray-500 animate-pulse"
                        : gatewayOk
                          ? "bg-emerald-500"
                          : "bg-red-500 animate-pulse"
                    }`}
                  />
                  <span className="text-[10px] text-[#9ca3af]/70 drop-shadow">
                    {gatewayOk === null
                      ? t("home.connecting")
                      : gatewayOk
                        ? `Gateway ${latency ? `(${latency}ms)` : "✓"}`
                        : t("home.disconnected")}
                  </span>
                </div>
                {cronCount > 0 && (
                  <span className="text-[10px] text-[#9ca3af]/70 drop-shadow">
                    • {cronCount} cron
                  </span>
                )}
              </div>
              {/* Mode switch */}
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

      {/* ===== DASHBOARD ===== */}
      <AnimatePresence>
        {!isImmersive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 max-w-7xl mx-auto px-6 -mt-8 pb-12 space-y-6"
          >
            <QuickStats />

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-4">
                <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                  {t("home.sectionTeam")}
                </h2>
                <div
                  className={`grid gap-3 ${
                    agents.length === 1
                      ? "grid-cols-1 max-w-sm"
                      : agents.length === 2
                        ? "grid-cols-2"
                        : "grid-cols-3"
                  }`}
                >
                  {agents.map((agent, i) => {
                    const { id: _id, activeSessions: _as, lastSeen: _ls, ...cardProps } = agent;
                    return <AgentCard key={agent.id} {...cardProps} index={i} />;
                  })}
                </div>
                <MemoryPreview />
              </div>
              <div className="space-y-4">
                <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                  {t("home.sectionFeed")}
                </h2>
                <ActivityFeed />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
