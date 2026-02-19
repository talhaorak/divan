"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Navbar() {
  const pathname = usePathname();
  const { t, toggleLanguage } = useLanguage();

  const links = [
    { href: "/", label: t("nav.home"), icon: "🏛️" },
    { href: "/memory", label: t("nav.memory"), icon: "🧠" },
    { href: "/tasks", label: t("nav.tasks"), icon: "⚡" },
    { href: "/cron", label: t("nav.cron"), icon: "⏰" },
    { href: "/team", label: t("nav.team"), icon: "👥" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-[#2a2a3e]">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <span className="text-xl">🔴</span>
          <span className="font-semibold text-[#d4a017] text-lg tracking-wide">
            {t("nav.title")}
          </span>
          <span className="text-xs text-[#6b7280] ml-2">{t("nav.subtitle")}</span>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-200 flex items-center gap-1.5 ${
                  isActive
                    ? "bg-[#1a1a2e] text-[#d4a017] shadow-inner"
                    : "text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#12121a]"
                }`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Right side: status + language toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse-glow" />
            <span className="text-xs text-[#9ca3af]">{t("nav.agentActive")}</span>
          </div>

          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            title={t("lang.toggle")}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-[#2a2a3e] bg-[#12121a] text-[#9ca3af] hover:text-[#d4a017] hover:border-[#d4a017]/40 transition-all duration-200 tracking-widest"
          >
            {t("lang.label")}
          </button>
        </div>
      </div>
    </nav>
  );
}
