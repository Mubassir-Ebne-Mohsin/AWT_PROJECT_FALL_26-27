import "@/styles/m8.css";
import "@/styles/m12.css";
import "@/styles/m15.css";
import "@/styles/m16.css";
import "@/styles/m7.css";
import "@/styles/m5.css";
import "@/styles/m4.css";
import type { Metadata } from "next";
import { Archivo, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { Providers } from "@/components/providers";
import "./globals.css";

// Archivo's width axis drives the prototype's wide display headings (font-stretch).
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  // No title here: AppShell renders a <title> per route (see app-shell.tsx).
  description: "Draw a system architecture, find its bottlenecks under a traffic profile, and let AI explain and fix it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${instrument.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body>
        <a href="#main" className="sr">
          Skip to content
        </a>
        <div id="app">
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </div>
      </body>
    </html>
  );
}
