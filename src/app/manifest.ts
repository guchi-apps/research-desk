import type { MetadataRoute } from "next";

/**
 * PWAのmanifest。新規Webアプリは基本的にPWA対応とする（`guchi-apps/docs` の
 * `standards/tech-stack.md`）。
 *
 * **アイコンとテーマカラーは暫定値**（guchi-apps/issue-deck#2254）。`public/icon.svg` は
 * 差し替え前提のプレースホルダで、192/512のPNGと `apple-icon.png` はまだ無い。デザインを
 * 決めたらPNGを足し、`icons` と `theme_color` を更新する。
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
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
