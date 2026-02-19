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

  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobDraft, setJobDraft] = useState<string>("");
  const [editMode, setEditMode] = useState<"basic" | "json">("basic");
  const [jobForm, setJobForm] = useState<{ 
    name: string;
    enabled: boolean;
    agentId: string;
    sessionTarget: string;
    scheduleKind: "cron" | "every" | "at";
    cronExpr: string;
    tz: string;
    every: string;
    at: string;
    payloadKind: "agentTurn" | "systemEvent";
    message: string;
    systemEvent: string;
    model: string;
    timeoutSeconds: number;
  } | null>(null);

  const [creating, setCreating] = useState(false);
  const [createMode, setCreateMode] = useState<"basic" | "json">("basic");
  const [createDraft, setCreateDraft] = useState<string>("");
  const [createForm, setCreateForm] = useState<{ 
    name: string;
    enabled: boolean;
    agentId: string;
    sessionTarget: string;
    scheduleKind: "cron" | "every" | "at";
    cronExpr: string;
    tz: string;
    every: string;
    at: string;
    payloadKind: "agentTurn" | "systemEvent";
    message: string;
    systemEvent: string;
    model: string;
    timeoutSeconds: number;
  } | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/cron");
      const data = await res.json();
      setJobs(data.jobs || data || []);
    } catch {
      setJobs([]);
    }
  }, []);

  const [heartbeatAgent, setHeartbeatAgent] = useState("main");

  const fetchHeartbeat = useCallback(async () => {
    try {
      const res = await fetch(`/api/files?file=HEARTBEAT.md&agent=${encodeURIComponent(heartbeatAgent)}`);
      const data = await res.json();
      setHeartbeat({ content: data.content || "" });
      setHbContent(data.content || "");
    } catch {
      setHeartbeat(null);
    }
  }, [heartbeatAgent]);

  useEffect(() => {
    Promise.all([fetchJobs(), fetchHeartbeat()]).then(() => setLoading(false));
  }, [fetchJobs, fetchHeartbeat]);

  // Refetch heartbeat when agent changes (without resetting overall loading)
  useEffect(() => {
    fetchHeartbeat();
  }, [heartbeatAgent, fetchHeartbeat]);

  const runJob = useCallback(
    async (jobId: string) => {
      setActionMsg(t("cron.running", { id: jobId.slice(0, 8) }));
      try {
        const res = await fetch("/api/cron", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "run", jobId }),
        });
        const data = await res.json();
        if (!data.ok && data.error) throw new Error(data.error);
        setActionMsg(`✓ ${t("cron.runOk")}`);
        await fetchJobs();
      } catch (e) {
        setActionMsg(`✗ ${String(e)}`);
      }
      setTimeout(() => setActionMsg(null), 5000);
    },
    [t, fetchJobs]
  );

  const toggleJob = useCallback(
    async (jobId: string, enabled: boolean) => {
      const key = enabled ? "cron.activating" : "cron.stopping";
      setActionMsg(t(key, { id: jobId.slice(0, 8) }));
      try {
        const res = await fetch("/api/cron", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: enabled ? "enable" : "disable", jobId }),
        });
        const data = await res.json();
        if (!data.ok && data.error) throw new Error(data.error);
        setActionMsg(`✓ ${t(enabled ? "cron.activated" : "cron.stopped")}`);
        await fetchJobs();
      } catch (e) {
        setActionMsg(`✗ ${String(e)}`);
      }
      setTimeout(() => setActionMsg(null), 5000);
    },
    [t, fetchJobs]
  );

  const startEditJob = useCallback((job: CronJob) => {
    setEditingJobId(job.id);
    setEditMode("basic");

    const scheduleKind = (job.schedule.kind as "cron" | "every" | "at") || "cron";
    const payloadKind = (job.payload.kind as "agentTurn" | "systemEvent") || "agentTurn";

    const form = {
      name: job.name || "",
      enabled: job.enabled,
      agentId: job.agentId || "main",
      sessionTarget: job.sessionTarget || "main",
      scheduleKind,
      cronExpr: job.schedule.expr || "",
      tz: job.schedule.tz || "Europe/Istanbul",
      every: job.schedule.everyMs ? `${Math.round(job.schedule.everyMs / 60000)}m` : "10m",
      at: job.schedule.at || "",
      payloadKind,
      message: job.payload.message || "",
      systemEvent: job.payload.text || "",
      model: String((job as unknown as { model?: string }).model || ""),
      timeoutSeconds: Number((job as unknown as { timeoutSeconds?: number }).timeoutSeconds || 300),
    };

    setJobForm(form);

    const editable = {
      name: form.name,
      enabled: form.enabled,
      agentId: form.agentId,
      sessionTarget: form.sessionTarget,
      schedule: job.schedule,
      payload: job.payload,
      model: form.model || undefined,
      timeoutSeconds: form.timeoutSeconds,
    };
    setJobDraft(JSON.stringify(editable, null, 2));
  }, []);

  const cancelEditJob = useCallback(() => {
    setEditingJobId(null);
    setJobDraft("");
    setJobForm(null);
    setEditMode("basic");
  }, []);

  const buildPatchFromForm = (form: NonNullable<typeof jobForm>): Record<string, unknown> => {
    const patch: Record<string, unknown> = {
      name: form.name,
      enabled: form.enabled,
      agentId: form.agentId,
      sessionTarget: form.sessionTarget,
      model: form.model || undefined,
      timeoutSeconds: form.timeoutSeconds,
    };

    if (form.scheduleKind === "cron") {
      patch.cron = form.cronExpr;
      patch.tz = form.tz;
    } else if (form.scheduleKind === "every") {
      patch.every = form.every;
    } else if (form.scheduleKind === "at") {
      patch.at = form.at;
    }

    if (form.payloadKind === "agentTurn") {
      patch.message = form.message;
    } else {
      patch.systemEvent = form.systemEvent;
    }

    return patch;
  };

  const saveEditJob = useCallback(async () => {
    if (!editingJobId) return;
    try {
      let patch: Record<string, unknown> | null = null;

      if (editMode === "basic") {
        if (!jobForm) throw new Error("Missing job form");
        patch = buildPatchFromForm(jobForm);
      } else {
        const parsed = JSON.parse(jobDraft || "{}") as Record<string, unknown>;
        const schedule = (parsed.schedule as Record<string, unknown>) || {};
        const payload = (parsed.payload as Record<string, unknown>) || {};
        const scheduleKind = String(schedule.kind || "");

        patch = {
          name: typeof parsed.name === "string" ? parsed.name : undefined,
          enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : undefined,
          agentId: typeof parsed.agentId === "string" ? parsed.agentId : undefined,
          sessionTarget: typeof parsed.sessionTarget === "string" ? parsed.sessionTarget : undefined,
          model: typeof parsed.model === "string" ? parsed.model : undefined,
          timeoutSeconds: typeof parsed.timeoutSeconds === "number" ? parsed.timeoutSeconds : undefined,
        };

        if (scheduleKind === "cron") {
          if (typeof schedule.expr === "string") patch.cron = schedule.expr;
          if (typeof schedule.tz === "string") patch.tz = schedule.tz;
        } else if (scheduleKind === "every") {
          const every = (schedule.every as string) || (schedule.everyMs ? `${Number(schedule.everyMs) / 1000}s` : undefined);
          if (typeof every === "string") patch.every = every;
        } else if (scheduleKind === "at") {
          if (typeof schedule.at === "string") patch.at = schedule.at;
        }

        if (payload.kind === "agentTurn" && typeof payload.message === "string") patch.message = payload.message;
        if (payload.kind === "systemEvent" && typeof payload.text === "string") patch.systemEvent = payload.text;
      }

      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", jobId: editingJobId, patch }),
      });
      const data = await res.json();
      if (!data.ok && data.error) throw new Error(data.error);

      setActionMsg(`✓ ${t("cron.savedJob")}`);
      cancelEditJob();
      await fetchJobs();
    } catch (e) {
      setActionMsg(`✗ ${String(e)}`);
    }
    setTimeout(() => setActionMsg(null), 6000);
  }, [editingJobId, editMode, jobDraft, jobForm, t, cancelEditJob, fetchJobs]);

  const deleteJob = useCallback(
    async (jobId: string) => {
      if (!confirm(t("cron.deleteConfirm"))) return;
      try {
        const res = await fetch("/api/cron", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rm", jobId }),
        });
        const data = await res.json();
        if (!data.ok && data.error) throw new Error(data.error);
        setActionMsg(`✓ ${t("cron.deleted")}`);
        if (selectedJob === jobId) setSelectedJob(null);
        if (editingJobId === jobId) cancelEditJob();
        await fetchJobs();
      } catch (e) {
        setActionMsg(`✗ ${String(e)}`);
      }
      setTimeout(() => setActionMsg(null), 6000);
    },
    [t, fetchJobs, selectedJob, editingJobId, cancelEditJob]
  );

  const startCreateJob = useCallback(() => {
    setCreating(true);
    setCreateMode("basic");

    const form = {
      name: "new-job",
      enabled: true,
      agentId: "main",
      sessionTarget: "isolated",
      scheduleKind: "cron" as const,
      cronExpr: "0 * * * *",
      tz: "Europe/Istanbul",
      every: "10m",
      at: "",
      payloadKind: "agentTurn" as const,
      message: "...",
      systemEvent: "...",
      model: "",
      timeoutSeconds: 300,
    };
    setCreateForm(form);

    setCreateDraft(JSON.stringify(form, null, 2));
  }, []);

  const cancelCreateJob = useCallback(() => {
    setCreating(false);
    setCreateDraft("");
    setCreateForm(null);
    setCreateMode("basic");
  }, []);

  const buildJobFromForm = (form: NonNullable<typeof createForm>): Record<string, unknown> => {
    const job: Record<string, unknown> = {
      name: form.name,
      enabled: form.enabled,
      agentId: form.agentId,
      sessionTarget: form.sessionTarget,
      model: form.model || undefined,
      timeoutSeconds: form.timeoutSeconds,
      tz: form.tz,
    };

    if (form.scheduleKind === "cron") job.cron = form.cronExpr;
    else if (form.scheduleKind === "every") job.every = form.every;
    else if (form.scheduleKind === "at") job.at = form.at;

    if (form.payloadKind === "agentTurn") job.message = form.message;
    else job.systemEvent = form.systemEvent;

    return job;
  };

  const submitCreateJob = useCallback(async () => {
    try {
      let job: Record<string, unknown>;

      if (createMode === "basic") {
        if (!createForm) throw new Error("Missing create form");
        job = buildJobFromForm(createForm);
      } else {
        const parsed = JSON.parse(createDraft || "{}") as Record<string, unknown>;
        job = {
          name: parsed.name,
          enabled: parsed.enabled,
          agentId: parsed.agentId,
          sessionTarget: parsed.sessionTarget,
          model: parsed.model,
          timeoutSeconds: parsed.timeoutSeconds,
          cron: parsed.cron,
          every: parsed.every,
          at: parsed.at,
          tz: parsed.tz,
          message: parsed.message,
          systemEvent: parsed.systemEvent,
        };
      }

      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", job }),
      });
      const data = await res.json();
      if (!data.ok && data.error) throw new Error(data.error);
      setActionMsg(`✓ ${t("cron.created")}`);
      cancelCreateJob();
      await fetchJobs();
    } catch (e) {
      setActionMsg(`✗ ${String(e)}`);
    }
    setTimeout(() => setActionMsg(null), 6000);
  }, [createMode, createDraft, createForm, t, fetchJobs, cancelCreateJob]);

  const saveHeartbeat = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: "HEARTBEAT.md", content: hbContent, agent: heartbeatAgent }),
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
  }, [hbContent, t, heartbeatAgent]);

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
  }, [jobs, filter, sortKey, agentFilter]);

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
            <button
              onClick={startCreateJob}
              className="text-[11px] px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
            >
              {t("cron.add")}
            </button>
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

                      {/* Edit / Delete */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#2a2a3e]/50">
                        <div className="flex items-center gap-2">
                          {editingJobId !== job.id ? (
                            <button
                              onClick={() => startEditJob(job)}
                              className="text-[10px] px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] text-[#9ca3af] hover:bg-[#22223a]"
                            >
                              {t("cron.editJob")}
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={saveEditJob}
                                className="text-[10px] px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                              >
                                {t("cron.saveJob")}
                              </button>
                              <button
                                onClick={cancelEditJob}
                                className="text-[10px] px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] text-[#6b7280]"
                              >
                                {t("cron.cancelEdit")}
                              </button>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => deleteJob(job.id)}
                          className="text-[10px] px-2 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20"
                        >
                          {t("cron.delete")}
                        </button>
                      </div>

                      {editingJobId === job.id && (
                        <div className="mt-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] text-[#6b7280]">{t("cron.editMode")}: </div>
                            <div className="flex rounded-lg border border-[#2a2a3e] overflow-hidden">
                              <button
                                onClick={() => setEditMode("basic")}
                                className={`px-2.5 py-1 text-[10px] ${editMode === "basic" ? "bg-[#2a2a3e] text-[#e8e6e3]" : "text-[#6b7280] hover:text-[#9ca3af]"}`}
                              >
                                {t("cron.basic")}
                              </button>
                              <button
                                onClick={() => setEditMode("json")}
                                className={`px-2.5 py-1 text-[10px] border-l border-[#2a2a3e] ${editMode === "json" ? "bg-[#2a2a3e] text-[#e8e6e3]" : "text-[#6b7280] hover:text-[#9ca3af]"}`}
                              >
                                {t("cron.advanced")}
                              </button>
                            </div>
                          </div>

                          {editMode === "basic" && jobForm && (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="col-span-2">
                                <label className="text-[10px] text-[#6b7280] uppercase">Name</label>
                                <input
                                  value={jobForm.name}
                                  onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })}
                                  className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] text-[#6b7280] uppercase">Agent</label>
                                <input
                                  value={jobForm.agentId}
                                  onChange={(e) => setJobForm({ ...jobForm, agentId: e.target.value })}
                                  className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-[#6b7280] uppercase">Session</label>
                                <select
                                  value={jobForm.sessionTarget}
                                  onChange={(e) => setJobForm({ ...jobForm, sessionTarget: e.target.value })}
                                  className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                >
                                  <option value="main">main</option>
                                  <option value="isolated">isolated</option>
                                </select>
                              </div>

                              <div>
                                <label className="text-[10px] text-[#6b7280] uppercase">Enabled</label>
                                <select
                                  value={jobForm.enabled ? "true" : "false"}
                                  onChange={(e) => setJobForm({ ...jobForm, enabled: e.target.value === "true" })}
                                  className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                >
                                  <option value="true">true</option>
                                  <option value="false">false</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] text-[#6b7280] uppercase">Model</label>
                                <input
                                  value={jobForm.model}
                                  onChange={(e) => setJobForm({ ...jobForm, model: e.target.value })}
                                  placeholder="(inherit)"
                                  className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] text-[#6b7280] uppercase">Timeout (sec)</label>
                                <input
                                  type="number"
                                  value={jobForm.timeoutSeconds}
                                  onChange={(e) => setJobForm({ ...jobForm, timeoutSeconds: Number(e.target.value) })}
                                  className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] text-[#6b7280] uppercase">Schedule</label>
                                <select
                                  value={jobForm.scheduleKind}
                                  onChange={(e) => setJobForm({ ...jobForm, scheduleKind: e.target.value as any })}
                                  className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                >
                                  <option value="cron">cron</option>
                                  <option value="every">every</option>
                                  <option value="at">at</option>
                                </select>
                              </div>

                              {jobForm.scheduleKind === "cron" && (
                                <>
                                  <div>
                                    <label className="text-[10px] text-[#6b7280] uppercase">Cron expr</label>
                                    <input
                                      value={jobForm.cronExpr}
                                      onChange={(e) => setJobForm({ ...jobForm, cronExpr: e.target.value })}
                                      className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-[#6b7280] uppercase">TZ</label>
                                    <input
                                      value={jobForm.tz}
                                      onChange={(e) => setJobForm({ ...jobForm, tz: e.target.value })}
                                      className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                    />
                                  </div>
                                </>
                              )}
                              {jobForm.scheduleKind === "every" && (
                                <div className="col-span-2">
                                  <label className="text-[10px] text-[#6b7280] uppercase">Every (e.g. 10m, 1h)</label>
                                  <input
                                    value={jobForm.every}
                                    onChange={(e) => setJobForm({ ...jobForm, every: e.target.value })}
                                    className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                  />
                                </div>
                              )}
                              {jobForm.scheduleKind === "at" && (
                                <div className="col-span-2">
                                  <label className="text-[10px] text-[#6b7280] uppercase">At (ISO or +20m)</label>
                                  <input
                                    value={jobForm.at}
                                    onChange={(e) => setJobForm({ ...jobForm, at: e.target.value })}
                                    className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                  />
                                </div>
                              )}

                              <div>
                                <label className="text-[10px] text-[#6b7280] uppercase">Payload</label>
                                <select
                                  value={jobForm.payloadKind}
                                  onChange={(e) => setJobForm({ ...jobForm, payloadKind: e.target.value as any })}
                                  className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                                >
                                  <option value="agentTurn">agentTurn</option>
                                  <option value="systemEvent">systemEvent</option>
                                </select>
                              </div>
                              <div className="col-span-2">
                                {jobForm.payloadKind === "agentTurn" ? (
                                  <>
                                    <label className="text-[10px] text-[#6b7280] uppercase">Message</label>
                                    <textarea
                                      value={jobForm.message}
                                      onChange={(e) => setJobForm({ ...jobForm, message: e.target.value })}
                                      className="w-full mt-1 h-28 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3] font-mono"
                                    />
                                  </>
                                ) : (
                                  <>
                                    <label className="text-[10px] text-[#6b7280] uppercase">System event text</label>
                                    <textarea
                                      value={jobForm.systemEvent}
                                      onChange={(e) => setJobForm({ ...jobForm, systemEvent: e.target.value })}
                                      className="w-full mt-1 h-28 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3] font-mono"
                                    />
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {editMode === "json" && (
                            <textarea
                              value={jobDraft}
                              onChange={(e) => setJobDraft(e.target.value)}
                              className="w-full h-64 bg-[#12121a] border border-[#2a2a3e] rounded-xl p-3 text-[11px] text-[#e8e6e3] font-mono leading-relaxed focus:outline-none focus:border-[#d4a017]/50 resize-none"
                            />
                          )}
                        </div>
                      )}
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

      {/* Create Job Modal */}
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={cancelCreateJob}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              className="w-[min(900px,95vw)] rounded-2xl border border-[#2a2a3e] bg-[#0f0f16] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#e8e6e3]">{t("cron.addTitle")}</h3>
                  <p className="text-[10px] text-[#6b7280] mt-0.5">{t("cron.addDesc")}</p>
                </div>
                <button
                  onClick={cancelCreateJob}
                  className="text-[10px] px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] text-[#6b7280]"
                >
                  {t("cron.cancelEdit")}
                </button>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="text-[10px] text-[#6b7280]">{t("cron.editMode")}: </div>
                <div className="flex rounded-lg border border-[#2a2a3e] overflow-hidden">
                  <button
                    onClick={() => setCreateMode("basic")}
                    className={`px-2.5 py-1 text-[10px] ${createMode === "basic" ? "bg-[#2a2a3e] text-[#e8e6e3]" : "text-[#6b7280] hover:text-[#9ca3af]"}`}
                  >
                    {t("cron.basic")}
                  </button>
                  <button
                    onClick={() => setCreateMode("json")}
                    className={`px-2.5 py-1 text-[10px] border-l border-[#2a2a3e] ${createMode === "json" ? "bg-[#2a2a3e] text-[#e8e6e3]" : "text-[#6b7280] hover:text-[#9ca3af]"}`}
                  >
                    {t("cron.advanced")}
                  </button>
                </div>
              </div>

              {createMode === "basic" && createForm && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="col-span-2">
                    <label className="text-[10px] text-[#6b7280] uppercase">Name</label>
                    <input
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase">Agent</label>
                    <input
                      value={createForm.agentId}
                      onChange={(e) => setCreateForm({ ...createForm, agentId: e.target.value })}
                      className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase">Session</label>
                    <select
                      value={createForm.sessionTarget}
                      onChange={(e) => setCreateForm({ ...createForm, sessionTarget: e.target.value })}
                      className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                    >
                      <option value="main">main</option>
                      <option value="isolated">isolated</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase">Enabled</label>
                    <select
                      value={createForm.enabled ? "true" : "false"}
                      onChange={(e) => setCreateForm({ ...createForm, enabled: e.target.value === "true" })}
                      className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase">Model</label>
                    <input
                      value={createForm.model}
                      onChange={(e) => setCreateForm({ ...createForm, model: e.target.value })}
                      placeholder="(inherit)"
                      className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase">Timeout (sec)</label>
                    <input
                      type="number"
                      value={createForm.timeoutSeconds}
                      onChange={(e) => setCreateForm({ ...createForm, timeoutSeconds: Number(e.target.value) })}
                      className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase">Schedule</label>
                    <select
                      value={createForm.scheduleKind}
                      onChange={(e) => setCreateForm({ ...createForm, scheduleKind: e.target.value as any })}
                      className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                    >
                      <option value="cron">cron</option>
                      <option value="every">every</option>
                      <option value="at">at</option>
                    </select>
                  </div>

                  {createForm.scheduleKind === "cron" && (
                    <>
                      <div>
                        <label className="text-[10px] text-[#6b7280] uppercase">Cron expr</label>
                        <input
                          value={createForm.cronExpr}
                          onChange={(e) => setCreateForm({ ...createForm, cronExpr: e.target.value })}
                          className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#6b7280] uppercase">TZ</label>
                        <input
                          value={createForm.tz}
                          onChange={(e) => setCreateForm({ ...createForm, tz: e.target.value })}
                          className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                        />
                      </div>
                    </>
                  )}
                  {createForm.scheduleKind === "every" && (
                    <div className="col-span-2">
                      <label className="text-[10px] text-[#6b7280] uppercase">Every</label>
                      <input
                        value={createForm.every}
                        onChange={(e) => setCreateForm({ ...createForm, every: e.target.value })}
                        className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                      />
                    </div>
                  )}
                  {createForm.scheduleKind === "at" && (
                    <div className="col-span-2">
                      <label className="text-[10px] text-[#6b7280] uppercase">At</label>
                      <input
                        value={createForm.at}
                        onChange={(e) => setCreateForm({ ...createForm, at: e.target.value })}
                        className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] text-[#6b7280] uppercase">Payload</label>
                    <select
                      value={createForm.payloadKind}
                      onChange={(e) => setCreateForm({ ...createForm, payloadKind: e.target.value as any })}
                      className="w-full mt-1 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3]"
                    >
                      <option value="agentTurn">agentTurn</option>
                      <option value="systemEvent">systemEvent</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    {createForm.payloadKind === "agentTurn" ? (
                      <>
                        <label className="text-[10px] text-[#6b7280] uppercase">Message</label>
                        <textarea
                          value={createForm.message}
                          onChange={(e) => setCreateForm({ ...createForm, message: e.target.value })}
                          className="w-full mt-1 h-28 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3] font-mono"
                        />
                      </>
                    ) : (
                      <>
                        <label className="text-[10px] text-[#6b7280] uppercase">System event text</label>
                        <textarea
                          value={createForm.systemEvent}
                          onChange={(e) => setCreateForm({ ...createForm, systemEvent: e.target.value })}
                          className="w-full mt-1 h-28 bg-[#12121a] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#e8e6e3] font-mono"
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {createMode === "json" && (
                <textarea
                  value={createDraft}
                  onChange={(e) => setCreateDraft(e.target.value)}
                  className="w-full mt-3 h-[50vh] bg-[#12121a] border border-[#2a2a3e] rounded-xl p-3 text-[11px] text-[#e8e6e3] font-mono leading-relaxed focus:outline-none focus:border-[#d4a017]/50 resize-none"
                />
              )}

              <div className="flex items-center justify-end gap-2 mt-3">
                <button
                  onClick={cancelCreateJob}
                  className="text-[10px] px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] text-[#6b7280]"
                >
                  {t("cron.cancelEdit")}
                </button>
                <button
                  onClick={submitCreateJob}
                  className="text-[10px] px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                >
                  {t("cron.create")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ HEARTBEAT ═══ */}
      {tab === "heartbeat" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AgentSelector value={heartbeatAgent} onChange={setHeartbeatAgent} showAll={false} />
              <div>
                <h2 className="text-sm font-semibold text-[#e8e6e3]">{t("cron.heartbeatFile")}</h2>
                <p className="text-[10px] text-[#6b7280] mt-0.5">{t("cron.heartbeatDesc")}</p>
              </div>
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
