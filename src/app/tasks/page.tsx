"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoalNode = any;

export default function TasksPage() {
  const { t } = useLanguage();
  const [goals, setGoals] = useState<GoalNode>(null);
  const [todo, setTodo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"goals" | "todo">("goals");

  useEffect(() => {
    fetch("/api/goals")
      .then((r) => r.json())
      .then((data) => {
        setGoals(data.goals);
        setTodo(data.todo);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggleGoal = (id: string) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#d4a017]">{t("tasks.title")}</h1>
          <p className="text-sm text-[#6b7280]">{t("tasks.subtitle")}</p>
        </div>
        <div className="flex rounded-lg border border-[#2a2a3e] overflow-hidden">
          <button
            onClick={() => setTab("goals")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${tab === "goals" ? "bg-[#d4a017]/15 text-[#d4a017]" : "text-[#6b7280] hover:text-[#9ca3af]"}`}
          >
            {t("tasks.goals")}
          </button>
          <button
            onClick={() => setTab("todo")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${tab === "todo" ? "bg-[#d4a017]/15 text-[#d4a017]" : "text-[#6b7280] hover:text-[#9ca3af]"}`}
          >
            {t("tasks.todo")}
          </button>
        </div>
      </div>

      {tab === "goals" && (
        <>
          {goals ? (
            <div className="space-y-2">
              <GoalTree node={goals} depth={0} expandedGoals={expandedGoals} toggleGoal={toggleGoal} path="" />
            </div>
          ) : (
            <div className="rounded-2xl border border-[#2a2a3e] bg-[#12121a]/80 p-8 text-center space-y-4">
              <p className="text-4xl">🎯</p>
              <p className="text-sm text-[#6b7280]">{t("tasks.goalsEmpty")}</p>
              <p className="text-[10px] text-[#6b7280]/60 leading-relaxed max-w-md mx-auto">
                {t("tasks.goalsEmptyText")}{" "}
                {t("tasks.goalsEmptyHint")}
              </p>
              <details className="text-left max-w-md mx-auto">
                <summary className="text-[10px] text-[#d4a017] cursor-pointer">
                  {t("tasks.exampleFormat")}
                </summary>
                <pre className="mt-2 text-[10px] text-[#9ca3af] font-mono bg-[#1a1a2e] rounded-lg p-3 overflow-x-auto">{`name: "My Goals"
children:
  - name: "Learn TypeScript"
    delta: -0.3
    status: "in_progress"
    children:
      - name: "Complete tutorial"
        delta: 0
        status: "done"
      - name: "Build a project"
        delta: -0.5
        status: "pending"`}</pre>
              </details>
            </div>
          )}
        </>
      )}

      {tab === "todo" && (
        <div className="rounded-xl border border-[#2a2a3e] bg-[#12121a]/80 p-5 max-h-[70vh] overflow-y-auto">
          {todo ? (
            <pre className="text-xs text-[#9ca3af] leading-relaxed whitespace-pre-wrap font-mono">{todo}</pre>
          ) : (
            <div className="text-center py-8 space-y-2">
              <p className="text-2xl">📋</p>
              <p className="text-sm text-[#6b7280]">{t("tasks.todoEmpty")}</p>
              <p className="text-[10px] text-[#6b7280]/60">{t("tasks.todoEmptyHint")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoalTree({ node, depth, expandedGoals, toggleGoal, path }: { node: GoalNode; depth: number; expandedGoals: Set<string>; toggleGoal: (id: string) => void; path: string }) {
  if (!node || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    return (
      <div className="space-y-1">
        {node.map((item, i) => (
          <GoalTree key={i} node={item} depth={depth} expandedGoals={expandedGoals} toggleGoal={toggleGoal} path={`${path}/${i}`} />
        ))}
      </div>
    );
  }

  const name = node.name || node.goal || node.title || "";
  const delta = node.delta;
  const current = node.current;
  const target = node.target;
  const rawChildren = node.children || node.branches || node.subgoals || node.sub;
  // If children is a dict (keyed by name), convert to array
  const children = rawChildren && !Array.isArray(rawChildren) && typeof rawChildren === "object"
    ? Object.entries(rawChildren).map(([key, val]) => {
        if (typeof val === "object" && val !== null && !(val as GoalNode).name) {
          return { ...(val as object), name: key };
        }
        return val;
      })
    : rawChildren;
  const status = node.status;
  const lastActioned = node.last_actioned;
  const id = path + "/" + name;
  const hasChildren = children && (Array.isArray(children) ? children.length > 0 : true);
  const isExpanded = expandedGoals.has(id);

  const getPressureColor = (d: number | undefined) => {
    if (d === undefined || d === null) return "#6b7280";
    if (d <= -0.7) return "#dc2626";
    if (d <= -0.3) return "#f59e0b";
    if (d < 0) return "#eab308";
    if (d === 0) return "#22c55e";
    return "#3b82f6";
  };

  const pressureColor = getPressureColor(delta);

  // Handle wrapper objects like { root: { name: ..., branches: { ... } } }
  if (!name) {
    if (node.root) {
      return <GoalTree node={node.root} depth={depth} expandedGoals={expandedGoals} toggleGoal={toggleGoal} path={`${path}/root`} />;
    }
    return (
      <div>
        {Object.entries(node).map(([key, value]) => {
          if (typeof value === "object" && value !== null && key !== "branches" && key !== "children") {
            return (
              <div key={key}>
                <h3 className="text-xs font-semibold text-[#d4a017] uppercase tracking-wider mt-4 mb-2" style={{ marginLeft: depth * 16 }}>
                  {key}
                </h3>
                <GoalTree node={value} depth={depth} expandedGoals={expandedGoals} toggleGoal={toggleGoal} path={`${path}/${key}`} />
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div
        className="flex items-start gap-2 py-2 px-3 rounded-lg hover:bg-[#1a1a2e]/60 transition-colors cursor-pointer"
        style={{ marginLeft: depth * 20 }}
        onClick={() => hasChildren && toggleGoal(id)}
      >
        <span className={`text-[10px] text-[#6b7280] w-3 mt-1 transition-transform ${hasChildren ? (isExpanded ? "rotate-90" : "") : "invisible"}`}>▶</span>
        <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: pressureColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[#e8e6e3] font-medium">{name}</span>
            {status && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                status === "done" || status === "completed" ? "bg-green-500/10 text-green-400"
                  : status === "blocked" ? "bg-red-500/10 text-red-400"
                  : "bg-yellow-500/10 text-yellow-400"
              }`}>{status}</span>
            )}
          </div>
          {delta !== undefined && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-[#2a2a3e] rounded-full overflow-hidden max-w-32">
                <div className="h-full rounded-full transition-all" style={{ backgroundColor: pressureColor, width: `${Math.max(5, Math.min(100, (1 + delta) * 50))}%` }} />
              </div>
              <span className="text-[10px] text-[#6b7280]">Δ {typeof delta === "number" ? delta.toFixed(1) : delta}</span>
              {current !== undefined && target !== undefined && (
                <span className="text-[10px] text-[#6b7280]">({current}→{target})</span>
              )}
            </div>
          )}
          {node.current && <p className="text-[10px] text-[#9ca3af] mt-1">📍 {node.current}</p>}
          {node.target && <p className="text-[10px] text-emerald-400/70 mt-0.5">🎯 {node.target}</p>}
          {node.action && <p className="text-[10px] text-blue-400/70 mt-0.5">⚡ {node.action}</p>}
          {lastActioned && <span className="text-[10px] text-[#6b7280]">Son: {lastActioned}</span>}
          {node.priority && <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${node.priority === "critical" ? "bg-red-500/10 text-red-400" : node.priority === "high" ? "bg-amber-500/10 text-amber-400" : "bg-gray-500/10 text-gray-400"}`}>{node.priority}</span>}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <GoalTree node={children} depth={depth + 1} expandedGoals={expandedGoals} toggleGoal={toggleGoal} path={id} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
