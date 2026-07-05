import type { Metadata, Viewport } from "next";
import { Inter, Merriweather } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const merriweather = Merriweather({ subsets: ["latin"], variable: "--font-merriweather", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: { default: "ArenaFit — Compete. Improve. Dominate.", template: "%s · ArenaFit" },
  description:
    "Live fitness battles with AI rep counting. Get matched, turn on your camera, and out-rep your opponent in real time.",
};

export const viewport: Viewport = {
  themeColor: "#06080f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${merriweather.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
