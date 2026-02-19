"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import AgentSelector from "@/components/AgentSelector";

interface CronJob {
  id: string;
  name?: string;
  enabled: boolean;
  createdAtMs?: number;
  schedule: {
    kind: string;
    expr?: string;
    tz?: string;
    everyMs?: number;
    at?: string;
    anchorMs?: number;
  };
  payload: {
    kind: string;
    text?: string;
    message?: string;
  };
  sessionTarget?: string;
  notify?: boolean;
  agentId?: string;
  deleteAfterRun?: boolean;
  delivery?: { mode: string; channel?: string };
  state?: {
    lastRunAtMs?: number;
    lastStatus?: string;
    lastDurationMs?: number;
    nextRunAtMs?: number;
    consecutiveErrors?: number;
  };
}

type SortKey = "created" | "nextRun" | "name";
type FilterKey = "all" | "enabled" | "disabled";

interface HeartbeatConfig {
  content: string;
  lastModified?: string;
}

export default function CronPage() {
  const { t, relativeTime, language } = useLanguage();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [heartbeat, setHeartbeat] = useState<HeartbeatConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [editingHB, setEditingHB] = useState(false);
  const [hbContent, setHbContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"cron" | "heartbeat">("cron");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [agentFilter, setAgentFilter] = useState("all");

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/cron");
      const data = await res.json();
      setJobs(data.jobs || data || []);
    } catch {
      setJobs([]);
    }
  }, []);

  const fetchHeartbeat = useCallback(async () => {
    try {
      const res = await fetch("/api/files?file=HEARTBEAT.md");
      const data = await res.json();
      setHeartbeat({ content: data.content || "" });
      setHbContent(data.content || "");
    } catch {
      setHeartbeat(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchJobs(), fetchHeartbeat()]).then(() => setLoading(false));
  }, [fetchJobs, fetchHeartbeat]);

  const runJob = useCallback(
    (jobId: string) => {
      setActionMsg(t("cron.runHint", { id: jobId.slice(0, 8) }));
      setTimeout(() => setActionMsg(null), 8000);
    },
    [t]
  );

  const toggleJob = useCallback(
    (jobId: string, enabled: boolean) => {
      const key = enabled ? "cron.activateHint" : "cron.deactivateHint";
      setActionMsg(t(key, { id: jobId.slice(0, 8) }));
      setTimeout(() => setActionMsg(null), 8000);
    },
    [t]
  );

  const saveHeartbeat = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: "HEARTBEAT.md", content: hbContent }),
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg(t("cron.saved"));
        setEditingHB(false);
        setHeartbeat({ content: hbContent });
      } else {
        setActionMsg(`✗ ${data.error}`);
      }
    } catch (e) {
      setActionMsg(`✗ ${String(e)}`);
    }
    setSaving(false);
    setTimeout(() => setActionMsg(null), 5000);
  }, [hbContent, t]);

  const filteredAndSortedJobs = useMemo(() => {
    let result = [...jobs];
    // Agent filter
    if (agentFilter !== "all") {
      result = result.filter((j) => {
        const jobAgent = j.agentId || "main";
        return jobAgent === agentFilter;
      });
    }
    // Status filter
    if (filter === "enabled") result = result.filter((j) => j.enabled);
    else if (filter === "disabled") result = result.filter((j) => !j.enabled);
    // Sort
    if (sortKey === "created") {
      result.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    } else if (sortKey === "nextRun") {
      result.sort((a, b) => {
        const at = a.state?.nextRunAtMs ?? Infinity;
        const bt = b.state?.nextRunAtMs ?? Infinity;
        return at - bt;
      });
    } else if (sortKey === "name") {
      result.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    }
    return result;
  }, [jobs, filter, sortKey]);

  const getScheduleLabel = useCallback(
    (s: CronJob["schedule"]) => {
      if (s.kind === "cron" && s.expr) return t("cron.schedule.cron", { expr: s.expr });
      if (s.kind === "every" && s.everyMs) {
        const mins = s.everyMs / 60000;
        if (mins < 60) return t("cron.schedule.every", { mins: String(mins) });
        return t("cron.schedule.everyHour", { hours: String((mins / 60).toFixed(1)) });
      }
      if (s.kind === "at" && s.at)
        return t("cron.schedule.oneTime", {
          date: new Date(s.at).toLocaleString(language === "tr" ? "tr-TR" : "en-US"),
        });
      return s.kind;
    },
    [t, language]
  );

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
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#d4a017]">{t("cron.title")}</h1>
          <p className="text-sm text-[#6b7280]">{t("cron.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Agent filter (only show when on cron tab) */}
          {tab === "cron" && (
            <AgentSelector value={agentFilter} onChange={setAgentFilter} showAll />
          )}
        <div className="flex rounded-lg border border-[#2a2a3e] overflow-hidden">
          <button
            onClick={() => setTab("cron")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${tab === "cron" ? "bg-[#d4a017]/15 text-[#d4a017]" : "text-[#6b7280] hover:text-[#9ca3af]"}`}
          >
            {t("cron.tabCron")} ({jobs.length})
          </button>
          <button
            onClick={() => setTab("heartbeat")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${tab === "heartbeat" ? "bg-[#d4a017]/15 text-[#d4a017]" : "text-[#6b7280] hover:text-[#9ca3af]"}`}
          >
            {t("cron.tabHeartbeat")}
          </button>
        </div>
        </div> {/* end flex items-center gap-3 */}
      </div>

      {/* Action message */}
      <AnimatePresence>
        {actionMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`px-4 py-2 rounded-lg text-sm ${actionMsg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-blue-500/10 text-blue-400 border border-blue-500/30"}`}
          >
            {actionMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ CRON JOBS ═══ */}
      {tab === "cron" && (
        <div className="space-y-3">
          {/* Sort & Filter controls */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Filter buttons */}
            <div className="flex items-center gap-1 rounded-lg border border-[#2a2a3e] p-0.5">
              {(["all", "enabled", "disabled"] as FilterKey[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    filter === f
                      ? "bg-[#d4a017]/15 text-[#d4a017]"
                      : "text-[#6b7280] hover:text-[#9ca3af]"
                  }`}
                >
                  {t(`cron.filter${f.charAt(0).toUpperCase() + f.slice(1)}` as Parameters<typeof t>[0])}
                  {f === "all" && ` (${jobs.length})`}
                  {f === "enabled" && ` (${jobs.filter((j) => j.enabled).length})`}
                  {f === "disabled" && ` (${jobs.filter((j) => !j.enabled).length})`}
                </button>
              ))}
            </div>

            {/* Sort dropdown */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[11px] text-[#6b7280]">{t("cron.sortBy")}:</span>
              <div className="flex rounded-lg border border-[#2a2a3e] overflow-hidden">
                {([
                  ["created", "cron.sortCreated"],
                  ["nextRun", "cron.sortNextRun"],
                  ["name", "cron.sortName"],
                ] as [SortKey, Parameters<typeof t>[0]][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSortKey(key)}
                    className={`px-2.5 py-1 text-[11px] font-medium transition-colors border-r border-[#2a2a3e] last:border-r-0 ${
                      sortKey === key
                        ? "bg-[#2a2a3e] text-[#e8e6e3]"
                        : "text-[#6b7280] hover:text-[#9ca3af] hover:bg-[#1a1a2e]"
                    }`}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard label={t("cron.total")} value={jobs.length} icon="📊" />
            <StatCard label={t("cron.active")} value={jobs.filter((j) => j.enabled).length} icon="✅" color="emerald" />
            <StatCard label={t("cron.inactive")} value={jobs.filter((j) => !j.enabled).length} icon="⏸" color="amber" />
            <StatCard label={t("cron.lastHour")} value={jobs.filter((j) => j.state?.lastRunAtMs && Date.now() - j.state.lastRunAtMs < 3600000).length} icon="🔄" color="blue" />
          </div>

          {/* Job list */}
          {filteredAndSortedJobs.map((job, i) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`rounded-xl border bg-[#1a1a2e]/60 overflow-hidden transition-colors ${
                selectedJob === job.id ? "border-[#d4a017]/40" : "border-[#2a2a3e] hover:border-[#3a3a5e]"
              }`}
            >
              <div
                className="px-4 py-3 flex items-center gap-4 cursor-pointer"
                onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
              >
                {/* Status */}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${job.enabled ? "bg-emerald-500" : "bg-gray-500"}`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#e8e6e3] truncate">{job.name || job.id}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#12121a] border border-[#2a2a3e] text-[#6b7280]">
                      {job.sessionTarget || "main"}
                    </span>
                    {job.payload.kind === "agentTurn" && <span className="text-[10px] text-purple-400">🤖 agent</span>}
                    {job.payload.kind === "systemEvent" && <span className="text-[10px] text-blue-400">📢 event</span>}
                    {job.agentId && <span className="text-[10px] text-[#6b7280]">@{job.agentId}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-[#6b7280]">⏱ {getScheduleLabel(job.schedule)}</span>
                    {job.state?.lastRunAtMs && (
                      <span className={`text-[10px] ${job.state.lastStatus === "ok" ? "text-emerald-400/70" : "text-red-400/70"}`}>
                        {t("cron.last")} {relativeTime(job.state.lastRunAtMs)} {job.state.lastDurationMs ? `(${job.state.lastDurationMs}ms)` : ""}
                      </span>
                    )}
                    {job.state?.nextRunAtMs && (
                      <span className="text-[10px] text-blue-400/70">
                        {t("cron.next")} {relativeTime(job.state.nextRunAtMs)}
                      </span>
                    )}
                    {job.state?.consecutiveErrors ? (
                      <span className="text-[10px] text-red-400">{t("cron.errors", { n: job.state.consecutiveErrors })}</span>
                    ) : null}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => runJob(job.id)}
                    className="text-[10px] px-2 py-1 rounded-md bg-[#d4a017]/10 border border-[#d4a017]/30 text-[#d4a017] hover:bg-[#d4a017]/20 transition-colors"
                  >
                    {t("cron.run")}
                  </button>
                  <button
                    onClick={() => toggleJob(job.id, !job.enabled)}
                    className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                      job.enabled
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                    }`}
                  >
                    {job.enabled ? t("cron.stop") : t("cron.activate")}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              <AnimatePresence>
                {selectedJob === job.id && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="px-4 py-3 border-t border-[#2a2a3e]/50 space-y-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] text-[#6b7280] uppercase">Schedule</label>
                          <pre className="text-xs text-[#9ca3af] font-mono mt-1 bg-[#12121a] rounded-lg p-2">{JSON.stringify(job.schedule, null, 2)}</pre>
                        </div>
                        <div>
                          <label className="text-[10px] text-[#6b7280] uppercase">Payload</label>
                          <pre className="text-xs text-[#9ca3af] font-mono mt-1 bg-[#12121a] rounded-lg p-2 max-h-32 overflow-y-auto">{JSON.stringify(job.payload, null, 2)}</pre>
                        </div>
                      </div>
                      {job.state && (
                        <div>
                          <label className="text-[10px] text-[#6b7280] uppercase">State</label>
                          <pre className="text-xs text-[#9ca3af] font-mono mt-1 bg-[#12121a] rounded-lg p-2">{JSON.stringify(job.state, null, 2)}</pre>
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-[10px] text-[#6b7280] flex-wrap">
                        <span>ID: <code className="text-[#9ca3af]">{job.id}</code></span>
                        {job.notify && <span className="text-amber-400">🔔 notify</span>}
                        {job.schedule.tz && <span>TZ: {job.schedule.tz}</span>}
                        {job.delivery && <span>📤 {job.delivery.mode}{job.delivery.channel ? ` → ${job.delivery.channel}` : ""}</span>}
                        {job.deleteAfterRun && <span className="text-amber-400">{t("cron.oneTime")}</span>}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}

          {jobs.length === 0 && (
            <div className="rounded-xl border border-[#2a2a3e] bg-[#12121a]/80 p-8 text-center">
              <p className="text-sm text-[#6b7280]">{t("cron.empty")}</p>
              <p className="text-[10px] text-[#6b7280]/60 mt-1">{t("cron.emptyHint")}</p>
            </div>
          )}
          {jobs.length > 0 && filteredAndSortedJobs.length === 0 && (
            <div className="rounded-xl border border-[#2a2a3e] bg-[#12121a]/80 p-8 text-center">
              <p className="text-sm text-[#6b7280]">{t("cron.noResults")}</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ HEARTBEAT ═══ */}
      {tab === "heartbeat" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#e8e6e3]">{t("cron.heartbeatFile")}</h2>
              <p className="text-[10px] text-[#6b7280] mt-0.5">{t("cron.heartbeatDesc")}</p>
            </div>
            {!editingHB ? (
              <button
                onClick={() => setEditingHB(true)}
                className="text-[10px] px-2.5 py-1 rounded-md bg-[#d4a017]/10 border border-[#d4a017]/30 text-[#d4a017] hover:bg-[#d4a017]/20"
              >
                {t("cron.edit")}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditingHB(false); setHbContent(heartbeat?.content || ""); }}
                  className="text-[10px] px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] text-[#6b7280]"
                >
                  {t("cron.cancel")}
                </button>
                <button
                  onClick={saveHeartbeat}
                  disabled={saving}
                  className="text-[10px] px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 disabled:opacity-50"
                >
                  {saving ? "..." : t("cron.save")}
                </button>
              </div>
            )}
          </div>

          {editingHB ? (
            <textarea
              value={hbContent}
              onChange={(e) => setHbContent(e.target.value)}
              className="w-full h-[60vh] bg-[#12121a] border border-[#2a2a3e] rounded-xl p-4 text-xs text-[#e8e6e3] font-mono leading-relaxed focus:outline-none focus:border-[#d4a017]/50 resize-none"
            />
          ) : (
            <div className="rounded-xl border border-[#2a2a3e] bg-[#12121a]/80 p-5">
              <pre className="text-xs text-[#9ca3af] leading-relaxed whitespace-pre-wrap font-mono">
                {heartbeat?.content || t("cron.notFound")}
              </pre>
            </div>
          )}

          {/* Heartbeat explainer */}
          <div className="rounded-xl border border-[#2a2a3e] bg-[#1a1a2e]/40 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-[#9ca3af]">{t("cron.howItWorks")}</h3>
            <ul className="text-[10px] text-[#6b7280] space-y-1 list-disc list-inside">
              <li>{t("cron.howItem1")}</li>
              <li>{t("cron.howItem2")}</li>
              <li>
                {t("cron.howItem3").split("HEARTBEAT_OK").map((part, i, arr) =>
                  i < arr.length - 1 ? (
                    <span key={i}>{part}<code className="text-[#9ca3af]">HEARTBEAT_OK</code></span>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </li>
              <li>{t("cron.howItem4")}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color?: string }) {
  const colorClass =
    color === "emerald" ? "text-emerald-400"
      : color === "amber" ? "text-amber-400"
      : color === "blue" ? "text-blue-400"
      : "text-[#d4a017]";
  return (
    <div className="rounded-xl border border-[#2a2a3e] bg-[#1a1a2e]/60 p-3 flex items-center gap-3">
      <span className="text-lg">{icon}</span>
      <div>
        <p className={`text-lg font-bold ${colorClass}`}>{value}</p>
        <p className="text-[10px] text-[#6b7280] uppercase">{label}</p>
      </div>
    </div>
  );
}
