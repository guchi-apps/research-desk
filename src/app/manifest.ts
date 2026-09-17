import type { MetadataRoute } from "next";

/**
 * PWAのmanifest。新規Webアプリは基本的にPWA対応とする（`guchi-apps/docs` の
 * `standards/tech-stack.md`）。
 *
 * `share_target`はAndroidのホーム画面アプリを共有メニューに出すためのもの（#144）。iPhoneの
 * ホーム画面アプリは対応していないため、ショートカットから同じ受け口を呼ぶ（`docs/share-shortcut.md`）。
 * 受け口は`src/app/api/share/inbox/route.ts`で、Service Workerは使わない（#68）。
 *
 * アイコン・配色は`src/app/globals.css`の`--navy`/`--teal`/`--paper`と揃えている（#46）。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ワークリレー",
    short_name: "ワークリレー",
    description: "私用スマホで集めた業界ニュースや撮った写真を、社用PC・社用メールへ届ける個人用ツール",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#1d3440",
    theme_color: "#087f78",
    lang: "ja",
    share_target: {
      action: "/api/share/inbox",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "files", accept: ["image/*"] }],
      },
    },
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
