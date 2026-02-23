"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  lastErrorText?: string;
  hasCredential: boolean;
  maskedCredential?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOL_CATEGORY_ICONS: Record<string, string> = {
  terminal: "⌨",
  files: "📁",
  internet: "🌐",
  memory: "🧠",
  agents: "🤝",
  comms: "💬",
};

const STATUS_STYLES: Record<string, { dotClass: string; textClass: string; ring: string; glow: string }> = {
  active:   { dotClass: "bg-emerald-500", textClass: "text-emerald-400", ring: "ring-emerald-500/30", glow: "shadow-emerald-500/20" },
  idle:     { dotClass: "bg-amber-500",   textClass: "text-amber-400",   ring: "ring-amber-500/30",   glow: "shadow-amber-500/20" },
  standby:  { dotClass: "bg-blue-500",    textClass: "text-blue-400",    ring: "ring-blue-500/30",    glow: "shadow-blue-500/20" },
  sleeping: { dotClass: "bg-gray-500",    textClass: "text-gray-400",    ring: "ring-gray-500/30",    glow: "shadow-gray-500/20" },
};

const KNOWN_PROVIDERS = [
  "anthropic",
  "openrouter",
  "openai-codex",
  "openai",
  "github-copilot",
  "google-gemini-cli",
  "google-antigravity",
  "lmstudio",
];

const CREDENTIAL_TYPES = ["token", "api_key"] as const;

const MODEL_OPTIONS = [
  "anthropic/claude-opus-4-6",
  "anthropic/claude-sonnet-4-5",
  "openai/gpt-5.2",
  "google/gemini-3-pro-preview",
  "openrouter/auto",
];

const EMOJI_OPTIONS = ["🤖", "🔵", "🟢", "🟡", "🟣", "⚪", "🔶", "🌟", "🦊", "🐺", "🦁", "🐻", "🦅", "🐉"];

const OWNER_NAME = process.env.NEXT_PUBLIC_OPENCLAW_OWNER || "Owner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── ProfileStatusBadge ───────────────────────────────────────────────────────

function ProfileStatusBadge({ status }: { status: ProfileInfo["status"] }) {
  const { t } = useLanguage();
  const map = {
    ok:       "px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    cooldown: "px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse",
    disabled: "px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/20",
  };
  return <span className={map[status]}>{t(`team.profiles.status.${status}`)}</span>;
}

// ─── ProfileRow ───────────────────────────────────────────────────────────────

function ProfileRow({
  profile,
  agentId,
  onReset,
  onPrefer,
  onEdit,
}: {
  profile: ProfileInfo;
  agentId: string;
  onReset: (agentId: string, profileId: string) => Promise<void>;
  onPrefer: (agentId: string, provider: string, profileId: string) => Promise<void>;
  onEdit: (profile: ProfileInfo) => void;
}) {
  const { t } = useLanguage();
  const [resetState, setResetState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [preferState, setPreferState] = useState<"idle" | "loading" | "done">("idle");
  const [expanded, setExpanded] = useState(false);
  const [remaining, setRemaining] = useState(profile.cooldownRemainingMs ?? 0);

  // Live countdown for cooldown
  useEffect(() => {
    if (profile.status !== "cooldown" || !profile.cooldownUntil) return;
    const tick = () => setRemaining(Math.max(0, profile.cooldownUntil! - Date.now()));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [profile.status, profile.cooldownUntil]);

  const handleReset = async () => {
    setResetState("loading");
    try { await onReset(agentId, profile.profileId); setResetState("done"); }
    catch { setResetState("error"); }
  };

  const handlePrefer = async () => {
    setPreferState("loading");
    try { await onPrefer(agentId, profile.provider, profile.profileId); setPreferState("done"); }
    catch { setPreferState("idle"); }
  };

  const isBad = profile.status !== "ok";
  const displayStatus = resetState === "done" ? "ok" : profile.status;

  const bgClass = isBad && resetState !== "done"
    ? profile.status === "cooldown"
      ? "bg-amber-500/5 border-amber-500/20"
      : "bg-red-500/5 border-red-500/20"
    : "bg-[#0f0f1a] border-[#1e1e2e]";

  return (
    <div className={`rounded-xl border ${bgClass} transition-colors`}>
      {/* Main row */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-[#6b7280] hover:text-[#9ca3af] w-4 flex-shrink-0"
        >
          {expanded ? "▾" : "▸"}
        </button>

        {/* Profile info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono text-[#c9c7c1] truncate">{profile.profileId}</span>
            <ProfileStatusBadge status={displayStatus} />
            {profile.isLastGood && displayStatus === "ok" && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">
                {t("team.profiles.preferred")}
              </span>
            )}
            {preferState === "done" && !profile.isLastGood && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">
                {t("team.profiles.preferred")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-[10px] text-[#6b7280]">
              {profile.provider} · {profile.type}
              {profile.maskedCredential && (
                <span className="ml-1.5 font-mono text-[#4a4a5e]">{profile.maskedCredential}</span>
              )}
            </span>
            {profile.errorCount > 0 && (
              <span className="text-[10px] text-red-400/70">
                {t("team.profiles.errors", { n: profile.errorCount })}
              </span>
            )}
            {isBad && remaining > 0 && resetState !== "done" && profile.status === "cooldown" && (
              <span className="text-[10px] text-amber-400/80 font-mono">
                {t("team.profiles.cooldownRemaining", { time: formatCountdown(remaining) })}
              </span>
            )}
            {profile.status === "disabled" && profile.disabledReason && (
              <span className="text-[10px] text-red-400/70">
                {t("team.profiles.disabledReason", { reason: profile.disabledReason })}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Set Preferred */}
          {!profile.isLastGood && preferState !== "done" && (
            <button
              onClick={handlePrefer}
              disabled={preferState !== "idle"}
              className="px-2 py-0.5 rounded text-[9px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
            >
              {preferState === "loading" ? t("team.profiles.settingPreferred") : t("team.profiles.setPreferred")}
            </button>
          )}

          {/* Edit */}
          <button
            onClick={() => onEdit(profile)}
            className="px-2 py-0.5 rounded text-[9px] font-medium bg-[#1e1e2e] text-[#9ca3af] border border-[#2a2a3e] hover:bg-[#2a2a3e] transition-colors"
          >
            ✏
          </button>

          {/* Reset cooldown */}
          {isBad && (
            <button
              onClick={handleReset}
              disabled={resetState !== "idle"}
              className={`px-2 py-0.5 rounded text-[9px] font-medium border transition-all ${
                resetState === "done"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-default"
                  : resetState === "error"
                    ? "bg-red-500/10 text-red-400 border-red-500/20 cursor-default"
                    : resetState === "loading"
                      ? "bg-[#1a1a2e] text-[#6b7280] border-[#2a2a3e] cursor-wait"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20 cursor-pointer"
              }`}
            >
              {resetState === "done" ? t("team.profiles.resetDone")
                : resetState === "error" ? t("team.profiles.resetError")
                  : resetState === "loading" ? t("team.profiles.resetting")
                    : t("team.profiles.resetCooldown")}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 border-t border-white/5 space-y-2">
              {/* Failure breakdown */}
              {Object.keys(profile.failureCounts).length > 0 && (
                <div>
                  <p className="text-[9px] uppercase text-[#6b7280] tracking-wider mb-1">
                    {t("team.profiles.errors", { n: profile.errorCount })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(profile.failureCounts).map(([code, count]) => (
                      <span
                        key={code}
                        className="px-2 py-0.5 rounded text-[9px] font-mono bg-red-500/10 text-red-300 border border-red-500/15"
                      >
                        {code}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Last error text */}
              <div>
                <p className="text-[9px] uppercase text-[#6b7280] tracking-wider mb-1">
                  {t("team.profiles.lastError")}
                </p>
                {profile.lastErrorText ? (
                  <p className="text-[10px] text-red-300/80 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2 font-mono leading-relaxed break-all">
                    {profile.lastErrorText}
                  </p>
                ) : (
                  <p className="text-[10px] text-[#6b7280]">{t("team.profiles.noRecentErrors")}</p>
                )}
              </div>

              {/* Timestamps */}
              {profile.lastFailureAt && (
                <p className="text-[9px] text-[#6b7280]">
                  Last failure: {new Date(profile.lastFailureAt).toLocaleString()}
                  {profile.cooldownUntil && (
                    <> · Cooldown until: {new Date(profile.cooldownUntil).toLocaleString()}</>
                  )}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── ProfileEditModal ─────────────────────────────────────────────────────────

function ProfileEditModal({
  agentId,
  profile,
  isNew,
  onClose,
  onSaved,
}: {
  agentId: string;
  profile: ProfileInfo | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [profileId, setProfileId] = useState(profile?.profileId ?? "");
  const [provider, setProvider] = useState(profile?.provider ?? "anthropic");
  const [credType, setCredType] = useState<"token" | "api_key">(
    (profile?.type as "token" | "api_key") ?? "token"
  );
  const [credential, setCredential] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");

  const isOAuth = profile?.type === "oauth";

  // Auto-suggest profileId when provider changes in create mode
  const autoId = useRef(true);
  const handleProviderChange = (p: string) => {
    setProvider(p);
    if (isNew && autoId.current) {
      setProfileId(`${p}:default`);
    }
  };
  const handleProfileIdManualChange = (v: string) => {
    autoId.current = false;
    setProfileId(v);
  };

  const handleTest = async () => {
    const cred = credential.trim() || (isNew ? "" : "__use_saved__");
    if (!cred || cred === "__use_saved__" && !profile?.hasCredential) {
      setTestMsg("Enter a credential first");
      setTestState("fail");
      return;
    }
    setTestState("testing");
    setTestMsg("");
    try {
      const body = credential.trim()
        ? { provider, type: credType, credential: credential.trim() }
        : { agentId, profileId: profile!.profileId };
      const res = await fetch("/api/profiles/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTestState(data.ok ? "ok" : "fail");
      setTestMsg(data.message || (data.ok ? t("team.profiles.testOk") : t("team.profiles.testFail")));
    } catch {
      setTestState("fail");
      setTestMsg("Network error");
    }
  };

  const handleSave = async () => {
    setSaveState("saving");
    setSaveError("");
    try {
      const res = await fetch("/api/profiles/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          profileId,
          isNew,
          provider,
          type: credType,
          credential: credential.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaveState("ok");
        setTimeout(() => { onSaved(); onClose(); }, 800);
      } else {
        setSaveState("error");
        setSaveError(data.error || "Unknown error");
      }
    } catch {
      setSaveState("error");
      setSaveError("Network error");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl w-[480px] max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2a2a3e] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#e8e6e3]">
            🔑 {isNew ? t("team.profiles.newProfile") : t("team.profiles.editProfile")}
          </h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-[#9ca3af] text-lg leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {isOAuth && (
            <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 px-4 py-3">
              <p className="text-[11px] text-blue-400">{t("team.profiles.oauthReadOnly")}</p>
              <p className="text-[10px] text-[#6b7280] mt-1">
                oauth profile · provider: {profile?.provider}
              </p>
            </div>
          )}

          {!isOAuth && (
            <>
              {/* Profile ID */}
              <div>
                <label className="text-[10px] uppercase text-[#6b7280] tracking-wider block mb-1">
                  {t("team.profiles.profileId")}
                </label>
                <input
                  value={profileId}
                  onChange={(e) => handleProfileIdManualChange(e.target.value)}
                  disabled={!isNew}
                  placeholder={t("team.profiles.profileIdHint")}
                  className="w-full bg-[#0f0f1a] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e6e3] placeholder-[#6b7280]/50 focus:outline-none focus:border-[#d4a017]/50 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                />
              </div>

              {/* Provider */}
              <div>
                <label className="text-[10px] uppercase text-[#6b7280] tracking-wider block mb-1">
                  {t("team.profiles.provider")}
                </label>
                {isNew ? (
                  <div className="flex flex-wrap gap-1.5">
                    {KNOWN_PROVIDERS.map((p) => (
                      <button
                        key={p}
                        onClick={() => handleProviderChange(p)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all ${
                          provider === p
                            ? "bg-violet-500/15 border border-violet-500/40 text-violet-300"
                            : "bg-[#0f0f1a] border border-[#2a2a3e] text-[#6b7280] hover:text-[#9ca3af]"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-mono text-[#9ca3af] px-3 py-2 rounded-xl bg-[#0f0f1a] border border-[#2a2a3e]">
                    {provider}
                  </p>
                )}
              </div>

              {/* Credential type */}
              <div>
                <label className="text-[10px] uppercase text-[#6b7280] tracking-wider block mb-1">
                  {t("team.profiles.credentialType")}
                </label>
                <div className="flex gap-2">
                  {CREDENTIAL_TYPES.map((ct) => (
                    <button
                      key={ct}
                      onClick={() => setCredType(ct)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all ${
                        credType === ct
                          ? "bg-violet-500/15 border border-violet-500/40 text-violet-300"
                          : "bg-[#0f0f1a] border border-[#2a2a3e] text-[#6b7280] hover:text-[#9ca3af]"
                      }`}
                    >
                      {ct}
                    </button>
                  ))}
                </div>
              </div>

              {/* Credential value */}
              <div>
                <label className="text-[10px] uppercase text-[#6b7280] tracking-wider block mb-1">
                  {t("team.profiles.credential")}
                </label>
                <input
                  type="password"
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  placeholder={
                    isNew
                      ? t("team.profiles.credentialPlaceholder")
                      : profile?.maskedCredential
                        ? `${profile.maskedCredential} — ${t("team.profiles.credentialHint")}`
                        : t("team.profiles.credentialPlaceholder")
                  }
                  className="w-full bg-[#0f0f1a] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e6e3] placeholder-[#6b7280]/50 focus:outline-none focus:border-[#d4a017]/50 font-mono"
                />
                {!isNew && (
                  <p className="text-[9px] text-[#6b7280] mt-1 ml-1">{t("team.profiles.credentialHint")}</p>
                )}
              </div>

              {/* Test result */}
              {testState !== "idle" && (
                <div
                  className={`rounded-xl px-4 py-3 text-[11px] font-medium border ${
                    testState === "testing"
                      ? "bg-[#1a1a2e] border-[#2a2a3e] text-[#9ca3af]"
                      : testState === "ok"
                        ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-400"
                        : "bg-red-500/8 border-red-500/20 text-red-400"
                  }`}
                >
                  {testState === "testing"
                    ? t("team.profiles.testing")
                    : testMsg || (testState === "ok" ? t("team.profiles.testOk") : t("team.profiles.testFail"))}
                </div>
              )}

              {/* Save error */}
              {saveState === "error" && (
                <div className="rounded-xl px-4 py-3 text-[11px] bg-red-500/8 border border-red-500/20 text-red-400">
                  {t("team.profiles.saveErr", { error: saveError })}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleTest}
                  disabled={testState === "testing"}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all bg-[#1a1a2e] border border-[#2a2a3e] text-[#9ca3af] hover:bg-[#2a2a3e] disabled:opacity-50"
                >
                  {testState === "testing" ? t("team.profiles.testing") : t("team.profiles.test")}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveState === "saving" || saveState === "ok"}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                    saveState === "ok"
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : "bg-[#d4a017]/12 border-[#d4a017]/30 text-[#d4a017] hover:bg-[#d4a017]/20 disabled:opacity-50"
                  }`}
                >
                  {saveState === "saving"
                    ? t("team.profiles.saving")
                    : saveState === "ok"
                      ? t("team.profiles.savedOk")
                      : t("team.profiles.saveProfile")}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── New Agent form ───────────────────────────────────────────────────────────

interface NewAgentForm {
  name: string; emoji: string; role: string; model: string; channel: string; personality: string;
}

const DEFAULT_FORM: NewAgentForm = { name: "", emoji: "🤖", role: "", model: "anthropic/claude-sonnet-4-5", channel: "", personality: "" };

// ─── Main page ────────────────────────────────────────────────────────────────

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

  // Profile edit/create modal state
  const [profileModal, setProfileModal] = useState<{
    agentId: string;
    profile: ProfileInfo | null;
    isNew: boolean;
  } | null>(null);

  const refreshProfiles = useCallback(async () => {
    const res = await fetch("/api/profiles");
    const data = await res.json();
    setProfiles(data.agents || {});
  }, []);

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

      const discovered: {
        id: string; name: string; emoji: string; color: string; role: string;
        description: string; capabilities: string[];
        primaryModel?: string; fallbackModels?: string[];
      }[] = agentsData.agents || [];
      const gwAgents: Record<string, GatewayAgent> = gwData.agents || {};

      setAgents(discovered.map((a) => {
        const live = gwAgents[a.id];
        return {
          id: a.id, name: a.name, emoji: a.emoji, color: a.color,
          role: a.role || t("agent.defaultRole"),
          description: a.description || t("team.agent.genericDescription"),
          capabilities: a.capabilities || [],
          primaryModel: a.primaryModel,
          fallbackModels: a.fallbackModels,
          status: (live?.status as AgentInfo["status"]) || "standby",
          activeSessions: live?.activeSessions || 0,
          lastSeen: live?.lastSeen ? relativeTime(live.lastSeen) : t("team.unknown"),
        };
      }));
      setSubAgents(liveData.subAgents || []);
      setToolUsage(liveData.toolCategories || {});
      setProfiles(profilesData.agents || {});
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, [relativeTime, t]);

  const handleResetCooldown = useCallback(async (agentId: string, profileId: string) => {
    const res = await fetch("/api/profiles/reset", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, profileId }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as { error?: string }).error || "Reset failed"); }
    await refreshProfiles();
  }, [refreshProfiles]);

  const handlePreferProfile = useCallback(async (agentId: string, provider: string, profileId: string) => {
    const res = await fetch("/api/profiles/prefer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, provider, profileId }),
    });
    if (!res.ok) throw new Error("Prefer failed");
    await refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 10000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const selected = agents.find((a) => a.id === selectedAgent);
  const totalCooldown = Object.values(profiles).flat().filter((p) => p.status !== "ok").length;

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
          {totalCooldown > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 animate-pulse">
              <span className="text-xs font-medium text-amber-400">
                {t("team.cooldownBanner", { n: totalCooldown })}
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

      {/* Agent Cards */}
      <div className={`grid gap-5 ${
        agents.length === 1 ? "grid-cols-1 max-w-sm"
          : agents.length === 2 ? "grid-cols-2"
            : "grid-cols-3"
      }`}>
        {agents.map((agent, i) => {
          const sc = STATUS_STYLES[agent.status];
          const isSelected = selectedAgent === agent.id;
          const agentSubs = subAgents.filter((s) => s.parentAgent === agent.id || s.parentAgent === agent.name);
          const agentProfiles = profiles[agent.id] || [];
          const cooldownCount = agentProfiles.filter((p) => p.status !== "ok").length;
          const allCooldown = agentProfiles.length > 0 && agentProfiles.every((p) => p.status !== "ok");

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
              className={`relative rounded-2xl border p-5 cursor-pointer transition-all duration-300 group ${
                isSelected ? `shadow-lg ${sc.glow}` : "border-[#2a2a3e] hover:border-[#3a3a5e]"
              } ${allCooldown ? "ring-1 ring-amber-500/30" : ""}`}
              style={{
                backgroundColor: isSelected ? `${agent.color}08` : "#1a1a2e99",
                borderColor: isSelected ? `${agent.color}60` : undefined,
              }}
            >
              {/* Status indicator */}
              <div className="absolute top-4 right-4 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${sc.dotClass} ${agent.status === "active" ? "animate-pulse" : ""}`} />
                <span className={`text-[10px] font-medium ${sc.textClass}`}>{t(`status.${agent.status}`)}</span>
              </div>

              {/* Cooldown badge */}
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
                    allCooldown ? "ring-amber-500/40" : sc.ring
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

              <div className="flex items-center gap-4 text-[10px] text-[#6b7280]">
                <span>📡 {agent.activeSessions} {t("team.sessions")}</span>
                <span>🕐 {agent.lastSeen}</span>
                {agentSubs.length > 0 && <span className="text-emerald-400">⚡ {agentSubs.length} sub</span>}
              </div>

              {agent.primaryModel && (
                <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#12121a] border border-[#2a2a3e]">
                  <span className="text-[9px] text-[#6b7280]">🤖</span>
                  <span className="text-[10px] text-[#9ca3af] font-mono">{agent.primaryModel.split("/").pop()}</span>
                </div>
              )}

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

      {agents.length === 0 && (
        <div className="rounded-2xl border border-[#2a2a3e] bg-[#12121a]/80 p-8 text-center">
          <p className="text-sm text-[#6b7280]">No agents discovered.</p>
          <p className="text-[10px] text-[#6b7280]/60 mt-2">Check that ~/.openclaw/agents/ exists and the gateway is running.</p>
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
                  <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-3">{t("team.capabilities")}</h3>
                  {selected.capabilities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selected.capabilities.map((cap) => (
                        <span key={cap} className="px-2.5 py-1 rounded-lg text-[11px] font-medium border"
                          style={{ backgroundColor: `${selected.color}08`, borderColor: `${selected.color}25`, color: `${selected.color}cc` }}>
                          {cap}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#6b7280]">{t("team.agent.noCapabilities")}</p>
                  )}
                </div>

                {/* Tool Usage */}
                {selected.id === "main" && Object.keys(toolUsage).length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-3">{t("team.recentTools")}</h3>
                    <div className="space-y-2">
                      {Object.entries(toolUsage).sort(([, a], [, b]) => b.count - a.count).map(([catId, usage]) => {
                        const icon = TOOL_CATEGORY_ICONS[catId];
                        if (!icon) return null;
                        const freshness = Math.max(0, 1 - (Date.now() - new Date(usage.lastTs).getTime()) / 600000);
                        return (
                          <div key={catId} className="flex items-center gap-3">
                            <span className="text-sm w-5 text-center">{icon}</span>
                            <span className="text-xs text-[#9ca3af] w-16">{t(`team.toolCategory.${catId}`)}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-[#12121a] overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, usage.count * 3)}%` }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: selected.color, opacity: 0.3 + freshness * 0.7 }} />
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
                  <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-3">{t("team.model")}</h3>
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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">{t("team.profiles")}</h3>
                  <button
                    onClick={() => setProfileModal({ agentId: selected.id, profile: null, isNew: true })}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-[#d4a017]/10 border border-[#d4a017]/25 text-[#d4a017] hover:bg-[#d4a017]/20 transition-colors"
                  >
                    {t("team.profiles.addProfile")}
                  </button>
                </div>
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
                        onPrefer={handlePreferProfile}
                        onEdit={(p) => setProfileModal({ agentId: selected.id, profile: p, isNew: false })}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Sub-agents */}
              {subAgents.filter((s) => s.parentAgent === selected.id || s.parentAgent === selected.name).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-3">{t("team.activeSubAgents")}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {subAgents.filter((s) => s.parentAgent === selected.id || s.parentAgent === selected.name).map((sub, i) => (
                      <div key={`${sub.label}-${i}`} className="rounded-xl border border-[#2a2a3e] bg-[#12121a]/80 p-3 flex items-start gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${sub.status === "running" ? "bg-emerald-500 animate-pulse" : sub.status === "done" ? "bg-blue-500" : "bg-red-500"}`} />
                        <div className="min-w-0">
                          <p className="text-xs text-[#e8e6e3] font-medium truncate">{sub.task}</p>
                          <p className="text-[10px] text-[#6b7280] mt-0.5">{sub.label} • {sub.status}</p>
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
        <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-4">{t("team.organization")}</h2>
        <div className="rounded-2xl border border-[#2a2a3e] bg-[#1a1a2e]/60 p-8">
          <div className="flex flex-col items-center gap-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="px-6 py-3 rounded-2xl bg-gradient-to-b from-[#d4a017]/15 to-[#d4a017]/05 border border-[#d4a017]/30 text-center">
              <p className="text-lg font-semibold text-[#d4a017]">👑 {OWNER_NAME}</p>
              <p className="text-[10px] text-[#9ca3af] mt-0.5">{t("team.padisah")}</p>
            </motion.div>
            <div className="w-px h-8 bg-gradient-to-b from-[#d4a017]/30 to-[#2a2a3e]" />

            <div className="flex gap-12 items-start flex-wrap justify-center">
              {agents.map((agent, i) => {
                const agentSubs = subAgents.filter((s) => s.parentAgent === agent.id || s.parentAgent === agent.name);
                const sc = STATUS_STYLES[agent.status];
                const cooldownCount = (profiles[agent.id] || []).filter((p) => p.status !== "ok").length;
                return (
                  <motion.div key={agent.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }} className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl ring-2 ${
                        cooldownCount > 0 ? "ring-amber-500/40" : sc.ring
                      } transition-all duration-300 hover:scale-110`}
                        style={{ backgroundColor: `${agent.color}12` }}>
                        {agent.emoji}
                      </div>
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
                        <p className="text-[9px] text-[#6b7280] mt-0.5 font-mono">{agent.primaryModel.split("/").pop()}</p>
                      )}
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${sc.dotClass} ${agent.status === "active" ? "animate-pulse" : ""}`} />
                    {agentSubs.length > 0 && (
                      <>
                        <div className="w-px h-4 bg-[#2a2a3e]" />
                        <div className="flex gap-2">
                          {agentSubs.map((sub, j) => (
                            <div key={j} title={sub.task}
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs border transition-all hover:scale-110 ${
                                sub.status === "running" ? "bg-emerald-500/10 border-emerald-500/30"
                                  : sub.status === "done" ? "bg-blue-500/10 border-blue-500/30"
                                    : "bg-red-500/10 border-red-500/30"
                              }`}>
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

      {/* All Sub-agents */}
      {subAgents.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-4">{t("team.allSubAgents")}</h2>
          <div className="space-y-2">
            {subAgents.map((sub, i) => (
              <motion.div key={`${sub.label}-${i}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-[#2a2a3e] bg-[#1a1a2e]/60 p-4 flex items-center gap-4 hover:bg-[#22223a]/60 transition-colors">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${sub.status === "running" ? "bg-emerald-500 animate-pulse" : sub.status === "done" ? "bg-blue-500" : "bg-red-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#e8e6e3] font-medium truncate">{sub.task}</p>
                  <p className="text-[10px] text-[#6b7280] mt-0.5">{sub.label} → {sub.parentAgent} • {sub.status}</p>
                </div>
                <span className="text-[10px] text-[#6b7280]">{sub.startedAt ? relativeTime(new Date(sub.startedAt).getTime()) : ""}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {subAgents.length === 0 && (
        <div className="rounded-2xl border border-[#2a2a3e] bg-[#12121a]/80 p-8 text-center">
          <p className="text-sm text-[#6b7280]">{t("team.noSubAgents")}</p>
          <p className="text-[10px] text-[#6b7280]/60 mt-2">{t("team.noSubAgentsHint")}</p>
        </div>
      )}

      {/* Add Agent Modal */}
      <AnimatePresence>
        {showAddAgent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setShowAddAgent(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-2xl w-[560px] max-h-[85vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-[#2a2a3e] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#e8e6e3]">🤖 {t("team.addAgent")}</h2>
                <button onClick={() => setShowAddAgent(false)} className="text-[#6b7280] hover:text-[#9ca3af]">✕</button>
              </div>
              {!generatedConfig ? (
                <div className="p-6 space-y-4">
                  <div className="flex gap-3">
                    <div>
                      <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.emoji")}</label>
                      <div className="flex flex-wrap gap-1 max-w-[120px]">
                        {EMOJI_OPTIONS.map((e) => (
                          <button key={e} onClick={() => setNewAgent((p) => ({ ...p, emoji: e }))}
                            className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center transition-all ${newAgent.emoji === e ? "bg-[#d4a017]/20 ring-1 ring-[#d4a017]/50 scale-110" : "bg-[#12121a] hover:bg-[#22223a]"}`}>
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.name")}</label>
                      <input value={newAgent.name} onChange={(e) => setNewAgent((p) => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Aria"
                        className="w-full bg-[#12121a] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e6e3] placeholder-[#6b7280]/50 focus:outline-none focus:border-[#d4a017]/50" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.role")}</label>
                    <input value={newAgent.role} onChange={(e) => setNewAgent((p) => ({ ...p, role: e.target.value }))}
                      placeholder="e.g. Research Assistant, Code Reviewer..."
                      className="w-full bg-[#12121a] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e6e3] placeholder-[#6b7280]/50 focus:outline-none focus:border-[#d4a017]/50" />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.model")}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {MODEL_OPTIONS.map((m) => (
                        <button key={m} onClick={() => setNewAgent((p) => ({ ...p, model: m }))}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all ${
                            newAgent.model === m ? "bg-[#d4a017]/15 border border-[#d4a017]/40 text-[#d4a017]"
                              : "bg-[#12121a] border border-[#2a2a3e] text-[#6b7280] hover:text-[#9ca3af]"}`}>
                          {m.split("/").pop()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.channel")}</label>
                    <input value={newAgent.channel} onChange={(e) => setNewAgent((p) => ({ ...p, channel: e.target.value }))}
                      placeholder="e.g. telegram, matrix, discord (optional)"
                      className="w-full bg-[#12121a] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e6e3] placeholder-[#6b7280]/50 focus:outline-none focus:border-[#d4a017]/50" />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.personality")}</label>
                    <textarea value={newAgent.personality} onChange={(e) => setNewAgent((p) => ({ ...p, personality: e.target.value }))}
                      placeholder="Describe the agent's personality, role, and behavior..." rows={3}
                      className="w-full bg-[#12121a] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e6e3] placeholder-[#6b7280]/50 focus:outline-none focus:border-[#d4a017]/50 resize-none" />
                  </div>
                  <button onClick={() => {
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
                  }} disabled={!newAgent.name.trim()}
                    className="w-full py-2.5 rounded-xl bg-[#d4a017]/15 border border-[#d4a017]/30 text-[#d4a017] text-sm font-medium hover:bg-[#d4a017]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {t("team.form.generate")}
                  </button>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{newAgent.emoji}</span>
                    <span className="text-sm font-semibold text-[#e8e6e3]">{newAgent.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">{t("team.form.ready")}</span>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase block mb-1">{t("team.form.configSnippet")}</label>
                    <pre className="bg-[#12121a] border border-[#2a2a3e] rounded-xl p-4 text-xs text-[#9ca3af] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{generatedConfig}</pre>
                  </div>
                  <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-3">
                    <p className="text-[11px] text-blue-400 leading-relaxed">ℹ️ {t("team.form.instructions")}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => navigator.clipboard.writeText(generatedConfig || "")}
                      className="flex-1 py-2 rounded-xl bg-[#d4a017]/15 border border-[#d4a017]/30 text-[#d4a017] text-xs font-medium hover:bg-[#d4a017]/25 transition-colors">
                      📋 {t("team.form.copy")}
                    </button>
                    <button onClick={() => { setShowAddAgent(false); setGeneratedConfig(null); }}
                      className="flex-1 py-2 rounded-xl bg-[#2a2a3e] border border-[#3a3a5e] text-[#9ca3af] text-xs font-medium hover:bg-[#3a3a5e] transition-colors">
                      {t("team.form.done")}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Edit/Create Modal */}
      <AnimatePresence>
        {profileModal && (
          <ProfileEditModal
            agentId={profileModal.agentId}
            profile={profileModal.profile}
            isNew={profileModal.isNew}
            onClose={() => setProfileModal(null)}
            onSaved={refreshProfiles}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
