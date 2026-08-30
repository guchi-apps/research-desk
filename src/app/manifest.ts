import type { MetadataRoute } from "next";

/**
 * PWAのmanifest。新規Webアプリは基本的にPWA対応とする（`guchi-apps/docs` の
 * `standards/tech-stack.md`）。
 *
 * **アイコンとテーマカラーは暫定値**（guchi-apps/issue-deck#2254）。192/512のPNGと
 * `apple-icon.png` は単色のプレースホルダ。デザインが決まったら差し替えたうえで
 * `icons` と `theme_color` を更新する。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "research-desk",
    short_name: "research-desk",
    description: "決めた条件で自動収集しつつクリップを溜め、AIアプリ（Claude／ChatGPT）に要約させ、資料として書き出す個人用ツール",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1120",
    theme_color: "#0f766e",
    lang: "ja",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
