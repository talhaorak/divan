"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface MemorySection {
  title: string;
  content: string;
  level: number;
}

export default function MemoryPreview() {
  const [sections, setSections] = useState<MemorySection[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    fetch("/api/memory")
      .then((r) => r.json())
      .then((data) => {
        setSections(data.mainMemory?.sections || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#2a2a3e] bg-[#12121a]/80 p-4 animate-pulse">
        <div className="h-4 bg-[#2a2a3e] rounded w-1/3 mb-3" />
        <div className="h-3 bg-[#2a2a3e] rounded w-full mb-2" />
        <div className="h-3 bg-[#2a2a3e] rounded w-2/3" />
      </div>
    );
  }

  const topSections = sections.filter((s) => s.level <= 2).slice(0, 6);

  return (
    <div className="rounded-2xl border border-[#2a2a3e] bg-[#12121a]/80 backdrop-blur-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2a2a3e] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#d4a017]">
          {t("memoryPreview.title")}
        </h2>
        <a
          href="/memory"
          className="text-[10px] text-[#9ca3af] hover:text-[#d4a017] transition-colors uppercase tracking-wider"
        >
          {t("memoryPreview.viewAll")}
        </a>
      </div>

      <div className="p-3 grid grid-cols-2 gap-2">
        {topSections.map((section, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-xl bg-[#1a1a2e] border border-[#2a2a3e]/50 p-3 hover:border-[#d4a017]/30 transition-all cursor-pointer"
          >
            <h3 className="text-xs font-medium text-[#e8e6e3] mb-1 truncate">
              {section.title}
            </h3>
            <p className="text-[10px] text-[#6b7280] line-clamp-2 leading-relaxed">
              {section.content.trim().slice(0, 120)}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
