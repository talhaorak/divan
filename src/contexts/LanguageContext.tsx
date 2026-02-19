"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { Language, translations } from "@/lib/i18n";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  /** Translate a key, with optional {param} interpolation */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Language-aware relative time formatter */
  relativeTime: (ts: number) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("tr");

  // Hydrate from localStorage after mount (avoid SSR mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("divan-lang") as Language | null;
      if (stored === "tr" || stored === "en") {
        setLanguageState(stored);
      }
    } catch {
      // localStorage unavailable (SSR guard)
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("divan-lang", lang);
    } catch {}
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next = prev === "tr" ? "en" : "tr";
      try {
        localStorage.setItem("divan-lang", next);
      } catch {}
      return next;
    });
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = translations[language];
      let value = dict[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(`{${k}}`, String(v));
        }
      }
      return value;
    },
    [language]
  );

  const relativeTime = useCallback(
    (ts: number): string => {
      const diff = Date.now() - ts;
      if (diff < 0) {
        const mins = Math.floor(-diff / 60000);
        if (mins < 1) return t("time.shortly");
        if (mins < 60) return t("time.inMins", { n: mins });
        const hours = Math.floor(mins / 60);
        if (hours < 24) return t("time.inHours", { n: hours });
        return t("time.inDays", { n: Math.floor(hours / 24) });
      }
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return t("time.justNow");
      if (mins < 60) return t("time.minsAgo", { n: mins });
      const hours = Math.floor(mins / 60);
      if (hours < 24) return t("time.hoursAgo", { n: hours });
      return t("time.daysAgo", { n: Math.floor(hours / 24) });
    },
    [t]
  );

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, toggleLanguage, t, relativeTime }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
