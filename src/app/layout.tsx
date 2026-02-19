import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import ClientProviders from "@/components/ClientProviders";

export const metadata: Metadata = {
  title: "Divan — Mission Control",
  description: "OpenClaw Mission Control Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased">
        <ClientProviders>
          <Navbar />
          <main className="pt-14">{children}</main>
        </ClientProviders>
      </body>
    </html>
  );
}
