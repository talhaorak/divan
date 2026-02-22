"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Stats {
  memoryFiles: number;
  goalCount: number;
  cronCount: number;
  activeJobs: number;
  lastActivityAt: number;
  uncommittedChanges: number;
}

function formatRelativeTime(ts: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return t("time.justNow");
  if (mins < 60) return t("time.minsAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("time.hoursAgo", { n: hours });
  return t("time.daysAgo", { n: Math.floor(hours / 24) });
}

export default function QuickStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    const load = () =>
      fetch("/api/stats")
        .then((r) => r.json())
        .then(setStats)
        .catch(() => {});

    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const items = [
    {
      label: t("stats.memoryFiles"),
      value: stats ? String(stats.memoryFiles) : "—",
      icon: "📝",
      color: "#d4a017",
    },
    {
      label: t("stats.goals"),
      value: stats ? String(stats.goalCount) : "—",
      icon: "🎯",
      color: "#dc2626",
    },
    {
      label: t("stats.activeJobs"),
      value: stats ? String(stats.activeJobs) : "—",
      icon: "⚙️",
      color: "#3b82f6",
    },
    {
      label: t("stats.gitChanges"),
      value: stats ? String(stats.uncommittedChanges) : "—",
      icon: "🔀",
      color: stats && stats.uncommittedChanges > 0 ? "#f59e0b" : "#22c55e",
      pulse: stats ? stats.uncommittedChanges > 0 : false,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="relative rounded-xl border border-[#2a2a3e] bg-[#12121a]/70 backdrop-blur-md p-3 flex items-center gap-3"
        >
          {"pulse" in stat && stat.pulse && (
            <motion.div
              className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
          )}
          <span className="text-xl">{stat.icon}</span>
          <div>
            <p className="text-lg font-bold" style={{ color: stat.color }}>
              {stat.value}
            </p>
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wider">
              {stat.label}
            </p>
          </div>
        </motion.div>
      ))}

      {/* Last activity indicator */}
      {stats != null && stats.lastActivityAt > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="col-span-4 text-right"
        >
          <span className="text-[10px] text-[#6b7280]">
            {t("stats.lastActivity")}: {formatRelativeTime(stats!.lastActivityAt, t)}
          </span>
        </motion.div>
      )}
    </div>
  );
}
