import type { MetadataRoute } from "next";

/**
 * PWAのmanifest。新規Webアプリは基本的にPWA対応とする（`guchi-apps/docs` の
 * `standards/tech-stack.md`）。
 *
 * アイコン・配色は`src/app/globals.css`の`--navy`/`--teal`/`--paper`と揃えている（#46）。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "research-desk",
    short_name: "research-desk",
    description: "決めた条件で自動収集しつつクリップを溜め、AIアプリ（Claude／ChatGPT）に要約させ、資料として書き出す個人用ツール",
    start_url: "/",
    display: "standalone",
    background_color: "#1d3440",
    theme_color: "#087f78",
    lang: "ja",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
