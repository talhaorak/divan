"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ActivityItem {
  id: string;
  agent: string;
  emoji: string;
  action: string;
  detail: string;
  time: string;
  color: string;
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    fetchActivities();
    const interval = setInterval(fetchActivities, 60000);
    return () => clearInterval(interval);
  }, []);

  function fetchActivities() {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((data) => {
        setActivities(data.activities || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  return (
    <div className="rounded-2xl border border-[#2a2a3e] bg-[#12121a]/70 backdrop-blur-md overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2a2a3e] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#d4a017]">{t("feed.title")}</h2>
        <div className="flex items-center gap-2">
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-emerald-500"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
          <span className="text-[10px] text-[#6b7280] uppercase tracking-wider">
            {t("feed.live")}
          </span>
        </div>
      </div>

      <div className="divide-y divide-[#2a2a3e]/50 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-8 text-center">
            <motion.div
              className="text-[#6b7280] text-xs"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              {t("feed.loading")}
            </motion.div>
          </div>
        ) : activities.length === 0 ? (
          <div className="px-4 py-8 text-center text-[#6b7280] text-xs">
            {t("feed.empty")}
          </div>
        ) : (
          activities.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="px-4 py-3 hover:bg-[#1a1a2e]/50 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <span className="text-sm mt-0.5">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-[#e8e6e3]">
                      {item.agent}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${item.color}15`,
                        color: item.color,
                      }}
                    >
                      {item.action}
                    </span>
                  </div>
                  <p className="text-xs text-[#9ca3af] truncate">{item.detail}</p>
                </div>
                <span className="text-[10px] text-[#6b7280] whitespace-nowrap">
                  {item.time}
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
