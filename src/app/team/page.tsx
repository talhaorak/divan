"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  role: string;
  description: string;
  status: "active" | "idle" | "standby" | "sleeping";
  color: string;
  primaryModel?: string;
  fallbackModels?: string[];
  activeSessions: number;
  lastSeen: string;
  capabilities: string[];
}

interface SubAgent {
  label: string;
  task: string;
  parentAgent: string;
  status: string;
  startedAt: string;
}

interface ToolUsage {
  category: string;
  count: number;
  lastTs: string;
  tools: string[];
}

interface GatewayAgent {
  status: string;
  lastSeen: number;
  activeSessions: number;
}

interface ProfileInfo {
  profileId: string;
  provider: string;
  type: string;
  status: "ok" | "cooldown" | "disabled";
  cooldownUntil?: number;
  cooldownRemainingMs?: number;
  disabledUntil?: number;
  disabledReason?: string;
  errorCount: number;
  lastFailureAt?: number;
  failureCounts: Record<string, number>;
  isLastGood: boolean;
}

const TOOL_CATEGORY_ICONS: Record<string, string> = {
  terminal: "⌨",
  files: "📁",
  internet: "🌐",
  memory: "🧠",
  agents: "🤝",
  comms: "💬",
};

const STATUS_STYLES: Record<string, { dotClass: string; textClass: string; ring: string; glow: string }> = {
  active: { dotClass: "bg-emerald-500", textClass: "text-emerald-400", ring: "ring-emerald-500/30", glow: "shadow-emerald-500/20" },
  idle: { dotClass: "bg-amber-500", textClass: "text-amber-400", ring: "ring-amber-500/30", glow: "shadow-amber-500/20" },
  standby: { dotClass: "bg-blue-500", textClass: "text-blue-400", ring: "ring-blue-500/30", glow: "shadow-blue-500/20" },
  sleeping: { dotClass: "bg-gray-500", textClass: "text-gray-400", ring: "ring-gray-500/30", glow: "shadow-gray-500/20" },
};

interface NewAgentForm {
  name: string;
  emoji: string;
  role: string;
  model: string;
  channel: string;
  personality: string;
}

const DEFAULT_FORM: NewAgentForm = {
  name: "",
  emoji: "🤖",
  role: "",
  model: "anthropic/claude-sonnet-4-5",
  channel: "",
  personality: "",
};

const MODEL_OPTIONS = [
  "anthropic/claude-opus-4-6",
  "anthropic/claude-sonnet-4-5",
  "openai/gpt-5.2",
  "google/gemini-3-pro-preview",
  "openrouter/auto",
];

const EMOJI_OPTIONS = ["🤖", "🔵", "🟢", "🟡", "🟣", "⚪", "🔶", "🌟", "🦊", "🐺", "🦁", "🐻", "🦅", "🐉"];

// Read owner name from env (client-side env must be NEXT_PUBLIC_*)
const OWNER_NAME = process.env.NEXT_PUBLIC_OPENCLAW_OWNER || "Owner";

/** Format milliseconds into a human-readable countdown */
function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSecs = Math.ceil(ms / 1000);
  if (totalSecs < 60) return `${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

/** Profile status badge */
function ProfileStatusBadge({ status }: { status: ProfileInfo["status"] }) {
  const { t } = useLanguage();
  if (status === "ok") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        {t("team.profiles.status.ok")}
      </span>
    );
  }
  if (status === "cooldown") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
        {t("team.profiles.status.cooldown")}
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
      {t("team.profiles.status.disabled")}
    </span>
  );
}

/** Single profile row in the expanded panel */
function ProfileRow({
  profile,
  agentId,
  onReset,
}: {
  profile: ProfileInfo;
  agentId: string;
  onReset: (agentId: string, profileId: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [resetState, setResetState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [remaining, setRemaining] = useState(profile.cooldownRemainingMs ?? 0);

  // Tick countdown for cooldown profiles
  useEffect(() => {
    if (profile.status !== "cooldown") return;
    if (!profile.cooldownUntil) return;
    const interval = setInterval(() => {
      const left = profile.cooldownUntil! - Date.now();
      setRemaining(Math.max(0, left));
    }, 1000);
    return () => clearInterval(interval);
  }, [profile.status, profile.cooldownUntil]);

  const handleReset = async () => {
    setResetState("loading");
    try {
      await onReset(agentId, profile.profileId);
      setResetState("done");
    } catch {
      setResetState("error");
    }
  };

  const isBad = profile.status !== "ok";

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 flex items-start gap-3 transition-colors ${
        isBad
          ? profile.status === "cooldown"
            ? "bg-amber-500/5 border-amber-500/20"
            : "bg-red-500/5 border-red-500/20"
          : "bg-[#0f0f1a] border-[#1e1e2e]"
      }`}
    >
      {/* Left column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-mono text-[#c9c7c1] truncate">{profile.profileId}</span>
          <ProfileStatusBadge status={resetState === "done" ? "ok" : profile.status} />
          {profile.isLastGood && profile.status === "ok" && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">
              last-good
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-[10px] text-[#6b7280]">{profile.provider} · {profile.type}</span>
          {profile.errorCount > 0 && (
            <span className="text-[10px] text-red-400/70">
              {t("team.profiles.errors", { n: profile.errorCount })}
            </span>
          )}
          {profile.status === "cooldown" && remaining > 0 && resetState !== "done" && (
            <span className="text-[10px] text-amber-400/80 font-mono">
              {t("team.profiles.cooldownRemaining", { time: formatCountdown(remaining) })}
            </span>
          )}
          {profile.status === "disabled" && profile.disabledReason && (
            <span className="text-[10px] text-red-400/70">
              {t("team.profiles.disabledReason", { reason: profile.disabledReason })}
            </span>
          )}
          {Object.keys(profile.failureCounts).length > 0 && (
            <span className="text-[9px] text-[#6b7280]">
              {Object.entries(profile.failureCounts)
                .map(([k, v]) => `${k}:${v}`)
                .join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* Reset button — only for cooldown/disabled */}
      {isBad && (
        <button
          onClick={handleReset}
          disabled={resetState !== "idle"}
          className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
            resetState === "done"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default"
              : resetState === "error"
                ? "bg-red-500/10 text-red-400 border border-red-500/20 cursor-default"
                : resetState === "loading"
                  ? "bg-[#1a1a2e] text-[#6b7280] border border-[#2a2a3e] cursor-wait"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 cursor-pointer"
          }`}
        >
          {resetState === "done"
            ? t("team.profiles.resetDone")
            : resetState === "error"
              ? t("team.profiles.resetError")
              : resetState === "loading"
                ? t("team.profiles.resetting")
                : t("team.profiles.resetCooldown")}
        </button>
      )}
    </div>
  );
}

export default function TeamPage() {
  const { t, relativeTime } = useLanguage();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [toolUsage, setToolUsage] = useState<Record<string, ToolUsage>>({});
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState<NewAgentForm>(DEFAULT_FORM);
  const [generatedConfig, setGeneratedConfig] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, gwRes, liveRes, profilesRes] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/gateway"),
        fetch("/api/live"),
        fetch("/api/profiles"),
      ]);
      const agentsData = await agentsRes.json();
      const gwData = await gwRes.json();
      const liveData = await liveRes.json();
      const profilesData = await profilesRes.json();

      const discoveredAgents: {
        id: string;
        name: string;
        emoji: string;
        color: string;
        role: string;
        description: string;
        capabilities: string[];
        primaryModel?: string;
        fallbackModels?: string[];
      }[] = agentsData.agents || [];

      const gwAgents: Record<string, GatewayAgent> = gwData.agents || {};

      const builtAgents: AgentInfo[] = discoveredAgents.map((a) => {
        const live = gwAgents[a.id];
        return {
          id: a.id,
          name: a.name,
          emoji: a.emoji,
          color: a.color,
          role: a.role || t("agent.defaultRole"),
          description: a.description || t("team.agent.genericDescription"),
          capabilities: a.capabilities || [],
          primaryModel: a.primaryModel,
          fallbackModels: a.fallbackModels,
          status: (live?.status as AgentInfo["status"]) || "standby",
          activeSessions: live?.activeSessions || 0,
          lastSeen: live?.lastSeen ? relativeTime(live.lastSeen) : t("team.unknown"),
        };
      });

      setAgents(builtAgents);
      setSubAgents(liveData.subAgents || []);
      setToolUsage(liveData.toolCategories || {});
      setProfiles(profilesData.agents || {});
    } catch {
      // silently fail — agents remain empty / show loading
    } finally {
      setLoading(false);
    }
  }, [relativeTime, t]);

  const handleResetCooldown = useCallback(async (agentId: string, profileId: string) => {
    const res = await fetch("/api/profiles/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, profileId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Reset failed");
    }
    // Refresh profiles after reset
    const profilesRes = await fetch("/api/profiles");
    const profilesData = await profilesRes.json();
    setProfiles(profilesData.agents || {});
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const selected = agents.find((a) => a.id === selectedAgent);

  /** Count total profiles in cooldown/disabled across all agents */
  const totalCooldownProfiles = Object.values(profiles)
    .flat()
    .filter((p) => p.status !== "ok").length;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[#d4a017] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#d4a017]">{t("team.title")}</h1>
          <p className="text-sm text-[#6b7280] mt-1">{t("team.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Global cooldown banner */}
          {totalCooldownProfiles > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 animate-pulse">
              <span className="text-xs font-medium text-amber-400">
                {t("team.cooldownBanner", { n: totalCooldownProfiles })}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a2e]/60 border border-[#2a2a3e]">
            <span className="text-[10px] text-[#6b7280]">{t("team.subAgents")}</span>
            <span className="text-xs font-semibold text-[#e8e6e3]">{subAgents.length}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a2e]/60 border border-[#2a2a3e]">
            <span className="text-[10px] text-[#6b7280]">{t("team.totalTools")}</span>
            <span className="text-xs font-semibold text-[#e8e6e3]">
              {Object.values(toolUsage).reduce((s, u) => s + u.count, 0)}
            </span>
          </div>
          <button
            onClick={() => { setShowAddAgent(true); setGeneratedConfig(null); setNewAgent(DEFAULT_FORM); }}
            className="px-3 py-1.5 rounded-lg bg-[#d4a017]/10 border border-[#d4a017]/30 text-[#d4a017] text-xs font-medium hover:bg-[#d4a017]/20 transition-colors"
          >
            + {t("team.addAgent")}
          </button>
        </div>
      </div>

      {/* Agent Cards Row */}
      <div
        className={`grid gap-5 ${
          agents.length === 1
            ? "grid-cols-1 max-w-sm"
            : agents.length === 2
              ? "grid-cols-2"
              : "grid-cols-3"
        }`}
      >
        {agents.map((agent, i) => {
          const sc = STATUS_STYLES[agent.status];
          const isSelected = selectedAgent === agent.id;
          const agentSubs = subAgents.filter((s) => s.parentAgent === agent.id || s.parentAgent === agent.name);
          const agentProfiles = profiles[agent.id] || [];
          const cooldownCount = agentProfiles.filter((p) => p.status !== "ok").length;
          const allInCooldown = agentProfiles.length > 0 && agentProfiles.every((p) => p.status !== "ok");

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
              className={`relative rounded-2xl border p-5 cursor-pointer transition-all duration-300 group ${
                isSelected ? `shadow-lg ${sc.glow}` : "border-[#2a2a3e] hover:border-[#3a3a5e]"
              } ${allInCooldown ? "ring-1 ring-amber-500/30" : ""}`}
              style={{
                backgroundColor: isSelected ? `${agent.color}08` : "#1a1a2e99",
                borderColor: isSelected ? `${agent.color}60` : undefined,
              }}
            >
              {/* Status indicator */}
              <div className="absolute top-4 right-4 flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${sc.dotClass} ${agent.status === "active" ? "animate-pulse" : ""}`}
                />
                <span className={`text-[10px] font-medium ${sc.textClass}`}>
                  {t(`status.${agent.status}`)}
                </span>
              </div>

              {/* Cooldown indicator badge */}
              {cooldownCount > 0 && (
                <div className="absolute top-4 left-4">
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25 animate-pulse">
                    ⚠ {cooldownCount}
                  </span>
                </div>
              )}

              {/* Avatar */}
              <div className="flex items-center gap-4 mb-4 mt-2">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ring-2 ${
                    allInCooldown ? "ring-amber-500/40" : sc.ring
                  } transition-all duration-300 group-hover:scale-105`}
                  style={{ backgroundColor: `${agent.color}15` }}
                >
                  {agent.emoji}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#e8e6e3]">{agent.name}</h3>
                  <p className="text-xs font-medium" style={{ color: agent.color }}>{agent.role}</p>
                </div>
              </div>

              <p className="text-xs text-[#9ca3af] mb-4 leading-relaxed">{agent.description}</p>

              {/* Quick stats */}
              <div className="flex items-center gap-4 text-[10px] text-[#6b7280]">
                <span>📡 {agent.activeSessions} {t("team.sessions")}</span>
                <span>🕐 {agent.lastSeen}</span>
                {agentSubs.length > 0 && (
                  <span className="text-emerald-400">⚡ {agentSubs.length} sub</span>
                )}
              </div>

              {/* Model tag */}
              {agent.primaryModel && (
                <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#12121a] border border-[#2a2a3e]">
                  <span className="text-[9px] text-[#6b7280]">🤖</span>
                  <span className="text-[10px] text-[#9ca3af] font-mono">{agent.primaryModel.split("/").pop()}</span>
                </div>
              )}

              {/* Selection indicator */}
              {isSelected && (
                <motion.div
                  layoutId="agent-selector"
                  className="absolute -bottom-px left-1/4 right-1/4 h-0.5 rounded-full"
                  style={{ backgroundColor: agent.color }}
                />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="rounded-2xl border border-[#2a2a3e] bg-[#12121a]/80 p-8 text-center">
          <p className="text-sm text-[#6b7280]">No agents discovered.</p>
          <p className="text-[10px] text-[#6b7280]/60 mt-2">
            Check that ~/.openclaw/agents/ exists and the gateway is running.
          </p>
        </div>
      )}

      {/* Expanded Detail Panel */}
      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-[#2a2a3e] bg-[#1a1a2e]/60 p-6 space-y-6">
              <div className="flex items-center gap-3">
                <span className="text-xl">{selected.emoji}</span>
                <h2 className="text-lg font-semibold text-[#e8e6e3]">
                  {selected.name} — {t("team.details")}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Capabilities */}
                <div>
                  <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-3">
                    {t("team.capabilities")}
                  </h3>
                  {selected.capabilities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selected.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium border"
                          style={{
                            backgroundColor: `${selected.color}08`,
                            borderColor: `${selected.color}25`,
                            color: `${selected.color}cc`,
                          }}
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#6b7280]">{t("team.agent.noCapabilities")}</p>
                  )}
                </div>

                {/* Tool Usage (for primary / main agent) */}
                {selected.id === "main" && Object.keys(toolUsage).length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-3">
                      {t("team.recentTools")}
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(toolUsage)
                        .sort(([, a], [, b]) => b.count - a.count)
                        .map(([catId, usage]) => {
                          const icon = TOOL_CATEGORY_ICONS[catId];
                          if (!icon) return null;
                          const freshness = Math.max(
                            0,
                            1 - (Date.now() - new Date(usage.lastTs).getTime()) / (10 * 60 * 1000)
                          );
                          return (
                            <div key={catId} className="flex items-center gap-3">
                              <span className="text-sm w-5 text-center">{icon}</span>
                              <span className="text-xs text-[#9ca3af] w-16">
                                {t(`team.toolCategory.${catId}`)}
                              </span>
                              <div className="flex-1 h-1.5 rounded-full bg-[#12121a] overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(100, usage.count * 3)}%` }}
                                  className="h-full rounded-full"
                                  style={{
                                    backgroundColor: selected.color,
                                    opacity: 0.3 + freshness * 0.7,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] text-[#6b7280] w-8 text-right">{usage.count}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* Model info */}
              {(selected.primaryModel || (selected.fallbackModels && selected.fallbackModels.length > 0)) && (
                <div>
                  <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-3">
                    {t("team.model")}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selected.primaryModel && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#12121a] border border-violet-500/20">
                        <span className="text-[9px] text-violet-400 uppercase font-semibold">{t("team.model.primary")}</span>
                        <span className="text-[10px] text-[#c9c7c1] font-mono">{selected.primaryModel}</span>
                      </div>
                    )}
                    {selected.fallbackModels?.map((m) => (
                      <div key={m} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#12121a] border border-[#2a2a3e]">
                        <span className="text-[9px] text-[#6b7280] uppercase font-semibold">{t("team.model.fallbacks")}</span>
                        <span className="text-[10px] text-[#9ca3af] font-mono">{m}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auth Profiles */}
              <div>
                <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-3">
                  {t("team.profiles")}
                </h3>
                {(profiles[selected.id] || []).length === 0 ? (
                  <p className="text-xs text-[#6b7280]">{t("team.profiles.noProfiles")}</p>
                ) : (
                  <div className="space-y-2">
                    {(profiles[selected.id] || []).map((profile) => (
                      <ProfileRow
                        key={profile.profileId}
                        profile={profile}
                        agentId={selected.id}
                        onReset={handleResetCooldown}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Sub-agents for this agent */}
              {subAgents.filter(
                (s) => s.parentAgent === selected.id || s.parentAgent === selected.name
              ).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-3">
                    {t("team.activeSubAgents")}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {subAgents
                      .filter(
                        (s) =>
                          s.parentAgent === selected.id ||
                          s.parentAgent === selected.name
                      )
                      .map((sub, i) => (
                        <div
                          key={`${sub.label}-${i}`}
                          className="rounded-xl border border-[#2a2a3e] bg-[#12121a]/80 p-3 flex items-start gap-3"
                        >
                          <div
                            className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${
                              sub.status === "running"
                                ? "bg-emerald-500 animate-pulse"
                                : sub.status === "done"
                                  ? "bg-blue-500"
                                  : "bg-red-500"
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-xs text-[#e8e6e3] font-medium truncate">{sub.task}</p>
                            <p className="text-[10px] text-[#6b7280] mt-0.5">
                              {sub.label} • {sub.status}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Organization Chart */}
      <div>
        <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-4">
          {t("team.organization")}
        </h2>
        <div className="rounded-2xl border border-[#2a2a3e] bg-[#1a1a2e]/60 p-8">
          <div className="flex flex-col items-center gap-4">
            {/* Owner */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-6 py-3 rounded-2xl bg-gradient-to-b from-[#d4a017]/15 to-[#d4a017]/05 border border-[#d4a017]/30 text-center"
            >
              <p className="text-lg font-semibold text-[#d4a017]">👑 {OWNER_NAME}</p>
              <p className="text-[10px] text-[#9ca3af] mt-0.5">{t("team.padisah")}</p>
            </motion.div>

            {/* Connection line */}
            <div className="w-px h-8 bg-gradient-to-b from-[#d4a017]/30 to-[#2a2a3e]" />

            {/* Agents row */}
            <div className="flex gap-12 items-start flex-wrap justify-center">
              {agents.map((agent, i) => {
                const agentSubs = subAgents.filter(
                  (s) => s.parentAgent === agent.id || s.parentAgent === agent.name
                );
                const sc = STATUS_STYLES[agent.status];
                const agentProfiles = profiles[agent.id] || [];
                const cooldownCount = agentProfiles.filter((p) => p.status !== "ok").length;

                return (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                    className="flex flex-col items-center gap-3"
                  >
                    <div className="relative">
                      <div
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl ring-2 ${
                          cooldownCount > 0 ? "ring-amber-500/40" : sc.ring
                        } transition-all duration-300 hover:scale-110`}
                        style={{ backgroundColor: `${agent.color}12` }}
                      >
                        {agent.emoji}
                      </div>
                      {/* Cooldown dot on org chart */}
                      {cooldownCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[8px] font-bold text-black flex items-center justify-center animate-pulse">
                          {cooldownCount}
                        </span>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-[#e8e6e3] font-semibold">{agent.name}</p>
                      <p className="text-[10px]" style={{ color: agent.color }}>{agent.role}</p>
                      {agent.primaryModel && (
                        <p className="text-[9px] text-[#6b7280] mt-0.5 font-mono">
                          {agent.primaryModel.split("/").pop()}
                        </p>
                      )}
                    </div>
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${sc.dotClass} ${agent.status === "active" ? "animate-pulse" : ""}`}
                    />

                    {/* Sub-agent satellites */}
                    {agentSubs.length > 0 && (
                      <>
                        <div className="w-px h-4 bg-[#2a2a3e]" />
                        <div className="flex gap-2">
                          {agentSubs.map((sub, j) => (
                            <div
                              key={j}
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs border transition-all hover:scale-110 ${
                                sub.status === "running"
                                  ? "bg-emerald-500/10 border-emerald-500/30"
                                  : sub.status === "done"
                                    ? "bg-blue-500/10 border-blue-500/30"
                                    : "bg-red-500/10 border-red-500/30"
                              }`}
                              title={sub.task}
                            >
                              {sub.status === "running" ? "🌀" : sub.status === "done" ? "✓" : "✗"}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Active Sub-agents full list */}
      {subAgents.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-4">
            {t("team.allSubAgents")}
          </h2>
          <div className="space-y-2">
            {subAgents.map((sub, i) => (
              <motion.div
                key={`${sub.label}-${i}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-[#2a2a3e] bg-[#1a1a2e]/60 p-4 flex items-center gap-4 hover:bg-[#22223a]/60 transition-colors"
              >
                <div
                  className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    sub.status === "running"
                      ? "bg-emerald-500 animate-pulse"
                      : sub.status === "done"
                        ? "bg-blue-500"
                        : "bg-red-500"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#e8e6e3] font-medium truncate">{sub.task}</p>
                  <p className="text-[10px] text-[#6b7280] mt-0.5">
                    {sub.label} → {sub.parentAgent} • {sub.status}
                  </p>
                </div>
                <span className="text-[10px] text-[#6b7280]">
                  {sub.startedAt ? relativeTime(new Date(sub.startedAt).getTime()) : ""}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for sub-agents */}
      {subAgents.length === 0 && (
        <div className="rounded-2xl border border-[#2a2a3e] bg-[#12121a]/80 p-8 text-center">
          <p className="text-sm text-[#6b7280]">{t("team.noSubAgents")}</p>
          <p className="text-[10px] text-[#6b7280]/60 mt-2">{t("team.noSubAgentsHint")}</p>
        </div>
      )}

      {/* Add Agent Modal */}
      <AnimatePresence>
        {showAddAgent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setShowAddAgent(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-2xl w-[560px] max-h-[85vh] overflow-y-auto"
            >
              <div className="px-6 py-4 border-b border-[#2a2a3e] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#e8e6e3]">🤖 {t("team.addAgent")}</h2>
                <button onClick={() => setShowAddAgent(false)} className="text-[#6b7280] hover:text-[#9ca3af]">✕</button>
              </div>

              {!generatedConfig ? (
                <div className="p-6 space-y-4">
                  {/* Emoji + Name row */}
                  <div className="flex gap-3">
                    <div>
                      <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.emoji")}</label>
                      <div className="flex flex-wrap gap-1 max-w-[120px]">
                        {EMOJI_OPTIONS.map((e) => (
                          <button
                            key={e}
                            onClick={() => setNewAgent((p) => ({ ...p, emoji: e }))}
                            className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center transition-all ${
                              newAgent.emoji === e ? "bg-[#d4a017]/20 ring-1 ring-[#d4a017]/50 scale-110" : "bg-[#12121a] hover:bg-[#22223a]"
                            }`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.name")}</label>
                      <input
                        value={newAgent.name}
                        onChange={(e) => setNewAgent((p) => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Aria"
                        className="w-full bg-[#12121a] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e6e3] placeholder-[#6b7280]/50 focus:outline-none focus:border-[#d4a017]/50"
                      />
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.role")}</label>
                    <input
                      value={newAgent.role}
                      onChange={(e) => setNewAgent((p) => ({ ...p, role: e.target.value }))}
                      placeholder="e.g. Research Assistant, Code Reviewer..."
                      className="w-full bg-[#12121a] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e6e3] placeholder-[#6b7280]/50 focus:outline-none focus:border-[#d4a017]/50"
                    />
                  </div>

                  {/* Model */}
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.model")}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {MODEL_OPTIONS.map((m) => (
                        <button
                          key={m}
                          onClick={() => setNewAgent((p) => ({ ...p, model: m }))}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all ${
                            newAgent.model === m
                              ? "bg-[#d4a017]/15 border border-[#d4a017]/40 text-[#d4a017]"
                              : "bg-[#12121a] border border-[#2a2a3e] text-[#6b7280] hover:text-[#9ca3af]"
                          }`}
                        >
                          {m.split("/").pop()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Channel */}
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.channel")}</label>
                    <input
                      value={newAgent.channel}
                      onChange={(e) => setNewAgent((p) => ({ ...p, channel: e.target.value }))}
                      placeholder="e.g. telegram, matrix, discord (optional)"
                      className="w-full bg-[#12121a] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e6e3] placeholder-[#6b7280]/50 focus:outline-none focus:border-[#d4a017]/50"
                    />
                  </div>

                  {/* Personality */}
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.personality")}</label>
                    <textarea
                      value={newAgent.personality}
                      onChange={(e) => setNewAgent((p) => ({ ...p, personality: e.target.value }))}
                      placeholder="Describe the agent's personality, role, and behavior..."
                      rows={3}
                      className="w-full bg-[#12121a] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e6e3] placeholder-[#6b7280]/50 focus:outline-none focus:border-[#d4a017]/50 resize-none"
                    />
                  </div>

                  <button
                    onClick={() => {
                      if (!newAgent.name.trim()) return;
                      const agentId = newAgent.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
                      const config = `# Add this to your openclaw.yaml under 'agents:'
${agentId}:
  name: "${newAgent.name}"
  emoji: "${newAgent.emoji}"
  model: "${newAgent.model}"${newAgent.channel ? `\n  channels:\n    - type: ${newAgent.channel}` : ""}${newAgent.personality ? `\n  personality: |\n    ${newAgent.personality.split("\n").join("\n    ")}` : ""}
  workspace: ~/workspace  # path to agent workspace
  heartbeat:
    enabled: true
    intervalMs: 300000`;
                      setGeneratedConfig(config);
                    }}
                    disabled={!newAgent.name.trim()}
                    className="w-full py-2.5 rounded-xl bg-[#d4a017]/15 border border-[#d4a017]/30 text-[#d4a017] text-sm font-medium hover:bg-[#d4a017]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("team.form.generate")}
                  </button>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{newAgent.emoji}</span>
                    <span className="text-sm font-semibold text-[#e8e6e3]">{newAgent.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {t("team.form.ready")}
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.configSnippet")}</label>
                    <pre className="bg-[#12121a] border border-[#2a2a3e] rounded-xl p-4 text-xs text-[#9ca3af] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{generatedConfig}</pre>
                  </div>

                  <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-3">
                    <p className="text-[11px] text-blue-400 leading-relaxed">
                      ℹ️ {t("team.form.instructions")}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => { navigator.clipboard.writeText(generatedConfig || ""); }}
                      className="flex-1 py-2 rounded-xl bg-[#d4a017]/15 border border-[#d4a017]/30 text-[#d4a017] text-xs font-medium hover:bg-[#d4a017]/25 transition-colors"
                    >
                      📋 {t("team.form.copy")}
                    </button>
                    <button
                      onClick={() => { setShowAddAgent(false); setGeneratedConfig(null); }}
                      className="flex-1 py-2 rounded-xl bg-[#2a2a3e] border border-[#3a3a5e] text-[#9ca3af] text-xs font-medium hover:bg-[#3a3a5e] transition-colors"
                    >
                      {t("team.form.done")}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
