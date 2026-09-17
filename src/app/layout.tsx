import type { Metadata, Viewport } from "next";
import "./globals.css";

import packageJson from "../../package.json";
import AppUpdateChecker from "@/components/AppUpdateChecker";

export const metadata: Metadata = {
  title: "ワークリレー",
  description:
    "私用スマホで集めた業界ニュースや撮った写真を、社用PC・社用メールへ届ける個人用ツール",
  applicationName: "ワークリレー",
  appleWebApp: { capable: true, title: "ワークリレー", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#087f78", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">
        {children}
        <AppUpdateChecker currentVersion={packageJson.version} />
      </body>
    </html>
  );
}
