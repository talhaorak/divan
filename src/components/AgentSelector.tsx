"use client";

import { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export interface AgentOption {
  id: string;
  name: string;
  emoji: string;
  color: string;
  hasWorkspace: boolean;
}

interface AgentSelectorProps {
  value: string; // agentId, e.g. "main" | "all"
  onChange: (agentId: string) => void;
  showAll?: boolean; // Whether to show "All Agents" option
  size?: "sm" | "md";
}

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  idle: "#f59e0b",
  standby: "#3b82f6",
  sleeping: "#6b7280",
};

export default function AgentSelector({
  value,
  onChange,
  showAll = false,
  size = "sm",
}: AgentSelectorProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, string>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch discovered agents from API
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.agents)) {
          setAgentOptions(
            data.agents.map((a: AgentOption) => ({
              id: a.id,
              name: a.name,
              emoji: a.emoji,
              color: a.color,
              hasWorkspace: a.hasWorkspace,
            }))
          );
        }
      })
      .catch(() => {
        // Fallback: single main agent
        setAgentOptions([
          { id: "main", name: "Main Agent", emoji: "🤖", color: "#dc2626", hasWorkspace: true },
        ]);
      });
  }, []);

  // Fetch live agent statuses from gateway
  useEffect(() => {
    fetch("/api/gateway")
      .then((r) => r.json())
      .then((data) => {
        if (data.agents) {
          const statuses: Record<string, string> = {};
          for (const [agentId, info] of Object.entries(
            data.agents as Record<string, { status: string }>
          )) {
            statuses[agentId] = info.status;
          }
          setAgentStatuses(statuses);
        }
      })
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const allOption: AgentOption = {
    id: "all",
    name: t("agentSelector.allAgents"),
    emoji: "👥",
    color: "#6b7280",
    hasWorkspace: false,
  };

  const agents = showAll ? [allOption, ...agentOptions] : agentOptions;
  const current = agents.find((a) => a.id === value) || agents[0];

  const getStatusDot = (agentId: string) => {
    const status = agentStatuses[agentId] || "sleeping";
    return STATUS_COLORS[status] || "#6b7280";
  };

  const paddingClass = size === "sm" ? "px-2.5 py-1" : "px-3 py-1.5";
  const textClass = size === "sm" ? "text-xs" : "text-sm";

  if (!current) return null;

  return (
    <div ref={dropdownRef} className="relative inline-block">
      {/* Trigger pill */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 ${paddingClass} rounded-full border border-[#2a2a3e] bg-[#12121a] hover:border-[#3a3a5e] hover:bg-[#1a1a2e] transition-all ${textClass} select-none`}
      >
        <span className="leading-none">{current.emoji}</span>
        <span className="font-medium" style={{ color: current.color }}>
          {current.name}
        </span>
        {value !== "all" && (
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: getStatusDot(value) }}
          />
        )}
        <span className="text-[#6b7280] text-[10px] ml-0.5">▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 bg-[#0e0e1a] border border-[#2a2a3e] rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
          {agents.map((agent) => {
            const isSelected = value === agent.id;
            return (
              <button
                key={agent.id}
                onClick={() => {
                  onChange(agent.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left ${
                  isSelected ? "bg-[#1a1a2e]" : "hover:bg-[#1a1a2e]/60"
                }`}
              >
                <span>{agent.emoji}</span>
                <span
                  className="flex-1 font-medium"
                  style={{ color: isSelected ? agent.color : "#e8e6e3" }}
                >
                  {agent.name}
                </span>
                {agent.id !== "all" && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getStatusDot(agent.id) }}
                  />
                )}
                {isSelected && (
                  <span className="text-[#d4a017] text-[10px]">✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
