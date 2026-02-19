"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

interface AgentCardProps {
  name: string;
  emoji: string;
  role: string;
  description: string;
  status: "active" | "idle" | "standby" | "sleeping";
  color: string;
  index: number;
}

const statusDotClass: Record<string, string> = {
  active: "bg-green-500",
  idle: "bg-yellow-500",
  standby: "bg-blue-400",
  sleeping: "bg-gray-500",
};

const statusBorderClass: Record<string, string> = {
  active: "border-green-500/30",
  idle: "border-yellow-500/20",
  standby: "border-blue-400/20",
  sleeping: "border-gray-500/10",
};

const statusAnimation: Record<string, string> = {
  active: "animate-breathe",
  idle: "",
  standby: "",
  sleeping: "",
};

export default function AgentCard({
  name,
  emoji,
  role,
  description,
  status,
  color,
  index,
}: AgentCardProps) {
  const { t } = useLanguage();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 0.5, ease: "easeOut" }}
      className={`relative rounded-2xl border ${statusBorderClass[status]} bg-[#1a1a2e]/70 backdrop-blur-md p-5 
        hover:bg-[#22223a]/80 transition-all duration-300 cursor-pointer group ${statusAnimation[status]}`}
      style={{
        boxShadow: status === "active" ? `0 0 30px ${color}15` : "none",
      }}
    >
      {/* Status indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${statusDotClass[status]} ${status === "active" ? "animate-pulse" : ""}`}
        />
        <span className="text-[10px] text-[#6b7280] uppercase tracking-wider">
          {t(`status.${status}`)}
        </span>
      </div>

      {/* Avatar */}
      <div
        className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl mb-3 ${status === "active" ? "animate-float" : ""}`}
        style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
      >
        {emoji}
      </div>

      {/* Info */}
      <h3 className="text-lg font-semibold text-[#e8e6e3] mb-0.5">{name}</h3>
      <p className="text-xs text-[#d4a017] font-medium mb-2">{role}</p>
      <p className="text-xs text-[#9ca3af] leading-relaxed">{description}</p>

      {/* Hover accent line */}
      <div
        className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ backgroundColor: color }}
      />
    </motion.div>
  );
}
