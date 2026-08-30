import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "research-desk",
  description:
    "決めた条件で自動収集しつつクリップを溜め、AIアプリ（Claude／ChatGPT）に要約させ、資料として書き出す個人用ツール",
  applicationName: "research-desk",
  appleWebApp: { capable: true, title: "research-desk", statusBarStyle: "default" },
  icons: {
    // 192/512/apple-iconのPNGは暫定値（guchi-apps/issue-deck#2254）。デザインが決まったら差し替える。
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#0f766e", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
