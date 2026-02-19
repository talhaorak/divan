"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import AgentSelector from "@/components/AgentSelector";

interface MemorySection {
  title: string;
  content: string;
  level: number;
}

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
  extension?: string;
}

type ViewMode = "memory" | "explorer";

const FAVORITES = [
  { name: "MEMORY.md", path: "MEMORY.md", icon: "🧠", labelKey: "fav.mainMemory" },
  { name: "SOUL.md", path: "SOUL.md", icon: "✨", labelKey: "fav.soul" },
  { name: "USER.md", path: "USER.md", icon: "👤", labelKey: "fav.user" },
  { name: "HEARTBEAT.md", path: "HEARTBEAT.md", icon: "💓", labelKey: "fav.heartbeat" },
  { name: "AGENTS.md", path: "AGENTS.md", icon: "📋", labelKey: "fav.agentRules" },
  { name: "goals.yaml", path: "goals.yaml", icon: "🎯", labelKey: "fav.goals" },
];

export default function MemoryPage() {
  const { t } = useLanguage();
  const [selectedAgent, setSelectedAgent] = useState("main");
  const [mode, setMode] = useState<ViewMode>("memory");
  const [sections, setSections] = useState<MemorySection[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<MemorySection[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [mainRaw, setMainRaw] = useState<string | null>(null);

  // Editor state
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [backups, setBackups] = useState<string[]>([]);
  const [showBackups, setShowBackups] = useState(false);

  // Explorer state
  const [currentDir, setCurrentDir] = useState("");
  const [dirEntries, setDirEntries] = useState<FileEntry[]>([]);
  const [explorerFile, setExplorerFile] = useState<string | null>(null);
  const [explorerContent, setExplorerContent] = useState<string | null>(null);

  // Load main memory
  useEffect(() => {
    fetch("/api/memory")
      .then((r) => r.json())
      .then((data) => {
        setSections(data.mainMemory?.sections || []);
        setMainRaw(data.mainMemory?.raw || null);
        setFiles(data.files || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load selected memory file
  useEffect(() => {
    if (selectedFile && mode === "memory") {
      fetch(`/api/memory?file=${encodeURIComponent(selectedFile)}&raw=1`)
        .then((r) => r.json())
        .then((data) => {
          setFileContent(data.sections || []);
          setRawContent(data.raw || null);
        })
        .catch(() => { setFileContent([]); setRawContent(null); });
    }
  }, [selectedFile, mode]);

  // Explorer directory loading
  useEffect(() => {
    if (mode === "explorer") {
      fetch(`/api/files?dir=${encodeURIComponent(currentDir)}`)
        .then((r) => r.json())
        .then((data) => setDirEntries(data.entries || []))
        .catch(() => setDirEntries([]));
    }
  }, [mode, currentDir]);

  // Load explorer file
  useEffect(() => {
    if (explorerFile) {
      fetch(`/api/files?file=${encodeURIComponent(explorerFile)}`)
        .then((r) => r.json())
        .then((data) => setExplorerContent(data.content || null))
        .catch(() => setExplorerContent(null));
    }
  }, [explorerFile]);

  const startEdit = useCallback((content: string) => {
    setEditContent(content);
    setEditing(true);
    setSaveMsg(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditContent("");
    setSaveMsg(null);
  }, []);

  const saveEdit = useCallback(async () => {
    setSaving(true);
    const file = selectedFile || "MEMORY.md";
    try {
      const res = await fetch("/api/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file, content: editContent }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaveMsg(t("memory.savedWith", { backup: data.backup }));
        setEditing(false);
        if (selectedFile) {
          setRawContent(editContent);
          setFileContent(parseLocalSections(editContent));
        } else {
          setMainRaw(editContent);
          setSections(parseLocalSections(editContent));
        }
      } else {
        setSaveMsg(t("memory.errorWith", { error: data.error }));
      }
    } catch (e) {
      setSaveMsg(t("memory.errorWith", { error: String(e) }));
    }
    setSaving(false);
  }, [editContent, selectedFile, t]);

  const loadBackups = useCallback(async () => {
    const file = selectedFile || "MEMORY.md";
    const res = await fetch(`/api/memory?backups=${encodeURIComponent(file)}`);
    const data = await res.json();
    setBackups(data.backups || []);
    setShowBackups(true);
  }, [selectedFile]);

  const restoreBackup = useCallback(async (backupName: string) => {
    const file = selectedFile || "MEMORY.md";
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", backupName, targetFile: file }),
    });
    const data = await res.json();
    if (data.ok) {
      setSaveMsg(t("memory.restored"));
      setShowBackups(false);
      window.location.reload();
    }
  }, [selectedFile, t]);

  const filteredSections = search
    ? sections.filter((s) =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.content.toLowerCase().includes(search.toLowerCase())
      )
    : sections;

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const dailyFiles = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
  const otherFiles = files.filter((f) => !/^\d{4}-\d{2}-\d{2}\.md$/.test(f));

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
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#d4a017]">{t("memory.title")}</h1>
          <p className="text-sm text-[#6b7280]">
            {sections.length} {t("memory.sectionsSuffix")} · {files.length} {t("memory.filesSuffix")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Agent selector */}
          <AgentSelector value={selectedAgent} onChange={setSelectedAgent} />
          {/* Mode switch */}
          <div className="flex rounded-lg border border-[#2a2a3e] overflow-hidden">
            <button
              onClick={() => setMode("memory")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === "memory" ? "bg-[#d4a017]/15 text-[#d4a017]" : "text-[#6b7280] hover:text-[#9ca3af]"}`}
            >
              {t("memory.modeMemory")}
            </button>
            <button
              onClick={() => setMode("explorer")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === "explorer" ? "bg-[#d4a017]/15 text-[#d4a017]" : "text-[#6b7280] hover:text-[#9ca3af]"}`}
            >
              {t("memory.modeFiles")}
            </button>
          </div>

          {/* Search (memory mode only) */}
          {mode === "memory" && (
            <div className="relative">
              <input
                type="text"
                placeholder={t("memory.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl px-4 py-2 pl-9 text-sm text-[#e8e6e3] placeholder-[#6b7280] focus:outline-none focus:border-[#d4a017]/50 w-64"
              />
              <span className="absolute left-3 top-2.5 text-[#6b7280]">🔍</span>
            </div>
          )}
        </div>
      </div>

      {saveMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-4 px-4 py-2 rounded-lg text-sm ${saveMsg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"}`}
        >
          {saveMsg}
        </motion.div>
      )}

      {/* ═══ NO WORKSPACE BANNER (non-main agents) ═══ */}
      {selectedAgent !== "main" && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/5 p-6 text-center"
        >
          <p className="text-2xl mb-2">🤷</p>
          <p className="text-sm font-medium text-[#e8e6e3]">{t("agentSelector.noWorkspace")}</p>
          <p className="text-xs text-[#6b7280] mt-1">{t("agentSelector.noWorkspaceHint")}</p>
        </motion.div>
      )}

      {/* Only render memory/explorer content for main agent */}
      {selectedAgent !== "main" ? null : (
      <>

      {/* ═══ MEMORY MODE ═══ */}
      {mode === "memory" && (
        <div className="grid grid-cols-4 gap-6">
          <div className="col-span-3 space-y-3">
            {selectedFile ? (
              <>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => { setSelectedFile(null); setFileContent([]); setRawContent(null); setEditing(false); }}
                    className="text-xs text-[#d4a017] hover:underline"
                  >
                    {t("memory.backToMain")}
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={loadBackups} className="text-[10px] px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] text-[#6b7280] hover:text-[#9ca3af]">
                      {t("memory.backups")}
                    </button>
                    {!editing ? (
                      <button onClick={() => startEdit(rawContent || "")} className="text-[10px] px-2 py-1 rounded-md bg-[#d4a017]/10 border border-[#d4a017]/30 text-[#d4a017] hover:bg-[#d4a017]/20">
                        {t("memory.edit")}
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button onClick={cancelEdit} className="text-[10px] px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] text-[#6b7280]">{t("memory.cancel")}</button>
                        <button onClick={saveEdit} disabled={saving} className="text-[10px] px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 disabled:opacity-50">
                          {saving ? t("memory.saving") : t("memory.save")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-[#e8e6e3]">📄 {selectedFile}</h2>
                {editing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-[60vh] bg-[#12121a] border border-[#2a2a3e] rounded-xl p-4 text-xs text-[#e8e6e3] font-mono leading-relaxed focus:outline-none focus:border-[#d4a017]/50 resize-none"
                  />
                ) : (
                  fileContent.map((section, i) => (
                    <SectionCard key={i} section={section} index={i} expanded={expandedSections.has(i)} onToggle={() => toggleSection(i)} />
                  ))
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">{t("memory.longTermHeader")}</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={loadBackups} className="text-[10px] px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] text-[#6b7280] hover:text-[#9ca3af]">
                      {t("memory.backups")}
                    </button>
                    {!editing ? (
                      <button onClick={() => startEdit(mainRaw || "")} className="text-[10px] px-2 py-1 rounded-md bg-[#d4a017]/10 border border-[#d4a017]/30 text-[#d4a017] hover:bg-[#d4a017]/20">
                        {t("memory.edit")}
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button onClick={cancelEdit} className="text-[10px] px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] text-[#6b7280]">{t("memory.cancel")}</button>
                        <button onClick={saveEdit} disabled={saving} className="text-[10px] px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 disabled:opacity-50">
                          {saving ? t("memory.saving") : t("memory.save")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {editing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-[60vh] bg-[#12121a] border border-[#2a2a3e] rounded-xl p-4 text-xs text-[#e8e6e3] font-mono leading-relaxed focus:outline-none focus:border-[#d4a017]/50 resize-none"
                  />
                ) : (
                  <AnimatePresence>
                    {filteredSections.map((section, i) => (
                      <SectionCard key={i} section={section} index={i} expanded={expandedSections.has(i)} onToggle={() => toggleSection(i)} />
                    ))}
                  </AnimatePresence>
                )}
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">{t("memory.dailyLogs")}</h3>
              <div className="space-y-0.5 max-h-60 overflow-y-auto">
                {dailyFiles.slice(0, 20).map((file) => (
                  <button key={file} onClick={() => { setSelectedFile(file); setEditing(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${selectedFile === file ? "bg-[#d4a017]/10 text-[#d4a017]" : "text-[#9ca3af] hover:bg-[#1a1a2e] hover:text-[#e8e6e3]"}`}>
                    {file.replace(".md", "")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">{t("memory.other")}</h3>
              <div className="space-y-0.5 max-h-60 overflow-y-auto">
                {otherFiles.map((file) => (
                  <button key={file} onClick={() => { setSelectedFile(file); setEditing(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${selectedFile === file ? "bg-[#d4a017]/10 text-[#d4a017]" : "text-[#9ca3af] hover:bg-[#1a1a2e] hover:text-[#e8e6e3]"}`}>
                    {file.replace(".md", "")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EXPLORER MODE ═══ */}
      {mode === "explorer" && (
        <div className="grid grid-cols-4 gap-6">
          {/* File tree */}
          <div className="col-span-1 space-y-3">
            {/* Favorites */}
            <div>
              <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">{t("memory.favorites")}</h3>
              <div className="space-y-0.5">
                {FAVORITES.map((fav) => (
                  <button key={fav.path} onClick={() => setExplorerFile(fav.path)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors ${explorerFile === fav.path ? "bg-[#d4a017]/10 text-[#d4a017]" : "text-[#9ca3af] hover:bg-[#1a1a2e] hover:text-[#e8e6e3]"}`}>
                    <span>{fav.icon}</span>
                    <span>{t(fav.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-[10px] text-[#6b7280] flex-wrap">
              <button onClick={() => setCurrentDir("")} className="hover:text-[#d4a017]">workspace</button>
              {currentDir.split("/").filter(Boolean).map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <span>/</span>
                  <button onClick={() => setCurrentDir(arr.slice(0, i + 1).join("/"))} className="hover:text-[#d4a017]">{part}</button>
                </span>
              ))}
            </div>

            {/* Directory listing */}
            <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
              {currentDir && (
                <button onClick={() => setCurrentDir(currentDir.split("/").slice(0, -1).join("/"))}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-[#6b7280] hover:bg-[#1a1a2e] hover:text-[#e8e6e3] flex items-center gap-2">
                  <span>📁</span><span>..</span>
                </button>
              )}
              {dirEntries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => {
                    if (entry.type === "directory") setCurrentDir(entry.path);
                    else setExplorerFile(entry.path);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors ${
                    explorerFile === entry.path ? "bg-[#d4a017]/10 text-[#d4a017]" : "text-[#9ca3af] hover:bg-[#1a1a2e] hover:text-[#e8e6e3]"
                  }`}
                >
                  <span>{entry.type === "directory" ? "📁" : getFileIcon(entry.extension)}</span>
                  <span className="truncate">{entry.name}</span>
                  {entry.size !== undefined && entry.type === "file" && (
                    <span className="ml-auto text-[10px] text-[#6b7280]">{formatSize(entry.size)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* File preview */}
          <div className="col-span-3">
            {explorerFile ? (
              <div className="rounded-xl border border-[#2a2a3e] bg-[#12121a]/80 overflow-hidden">
                <div className="px-4 py-2 border-b border-[#2a2a3e] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{getFileIcon(explorerFile.split(".").pop())}</span>
                    <span className="text-xs text-[#e8e6e3] font-medium">{explorerFile}</span>
                  </div>
                  <button onClick={() => setExplorerFile(null)} className="text-[10px] text-[#6b7280] hover:text-[#9ca3af]">✕</button>
                </div>
                <div className="p-4 max-h-[70vh] overflow-y-auto">
                  {explorerContent !== null ? (
                    <pre className="text-xs text-[#9ca3af] leading-relaxed whitespace-pre-wrap font-mono">{explorerContent}</pre>
                  ) : (
                    <p className="text-xs text-[#6b7280]">{t("memory.contentError")}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[#2a2a3e] bg-[#12121a]/80 p-12 text-center">
                <p className="text-2xl mb-2">📂</p>
                <p className="text-sm text-[#6b7280]">{t("memory.selectFile")}</p>
                <p className="text-[10px] text-[#6b7280]/60 mt-1">{t("memory.selectFileHint")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      </>) /* end selectedAgent === "main" */}

      {/* Backup dialog */}
      <AnimatePresence>
        {showBackups && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-2xl p-6 w-96 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[#e8e6e3]">{t("memory.backupsTitle")} — {selectedFile || "MEMORY.md"}</h3>
                <button onClick={() => setShowBackups(false)} className="text-[#6b7280] hover:text-[#9ca3af]">✕</button>
              </div>
              {backups.length > 0 ? (
                <div className="space-y-2">
                  {backups.map((b) => (
                    <div key={b} className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#2a2a3e] bg-[#12121a]">
                      <span className="text-[10px] text-[#9ca3af] font-mono truncate">{b}</span>
                      <button onClick={() => restoreBackup(b)} className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20">
                        {t("memory.restore")}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#6b7280]">{t("memory.backupsEmpty")}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionCard({ section, index, expanded, onToggle }: { section: MemorySection; index: number; expanded: boolean; onToggle: () => void }) {
  const levelColors: Record<number, string> = { 1: "#d4a017", 2: "#dc2626", 3: "#3b82f6", 4: "#6b7280" };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ delay: index * 0.02 }}
      className="rounded-xl border border-[#2a2a3e] bg-[#1a1a2e]/60 overflow-hidden hover:border-[#3a3a5e] transition-colors">
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-center justify-between group">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full" style={{ backgroundColor: levelColors[section.level] || "#6b7280" }} />
          <h3 className="text-sm font-medium" style={{ color: levelColors[section.level] || "#e8e6e3" }}>{section.title}</h3>
        </div>
        <span className={`text-xs text-[#6b7280] transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-3 border-t border-[#2a2a3e]/50">
              <pre className="text-xs text-[#9ca3af] leading-relaxed whitespace-pre-wrap font-sans mt-2">{section.content.trim()}</pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function parseLocalSections(content: string): MemorySection[] {
  const lines = content.split("\n");
  const sections: MemorySection[] = [];
  let current: MemorySection | null = null;
  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)/);
    if (match) {
      if (current) sections.push(current);
      current = { level: match[1].length, title: match[2], content: "" };
    } else if (current) {
      current.content += line + "\n";
    }
  }
  if (current) sections.push(current);
  return sections;
}

function getFileIcon(ext?: string): string {
  if (!ext) return "📄";
  const icons: Record<string, string> = {
    md: "📝", yaml: "⚙️", yml: "⚙️", json: "📊", ts: "🔷", tsx: "🔷",
    js: "🟡", py: "🐍", sh: "🐚", txt: "📄", css: "🎨", html: "🌐",
  };
  return icons[ext] || "📄";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
