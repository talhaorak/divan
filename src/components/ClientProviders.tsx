"use client";

import { ReactNode } from "react";
import { LanguageProvider } from "@/contexts/LanguageContext";

/**
 * Client-side providers wrapper — used in the (server) RootLayout.
 * Allows the layout to stay a React Server Component while still
 * mounting client-only contexts.
 */
export default function ClientProviders({ children }: { children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
