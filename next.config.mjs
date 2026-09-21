// @ts-check

// `.mjs` にしているのは、`next.config.ts` だと本番の `next start` が設定ファイルを
// トランスパイルするためだけにSWCのネイティブバイナリを読み込み、常駐メモリ・スレッドが増えるため。
// TypeScriptに戻さない（guchi-apps/ops-dashboard#308）。型は `// @ts-check` とJSDocで付ける。

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Tailscale経由（サブPCの開発サーバーをtailnetへ公開）でアクセスするための許可設定。
  // `*` は1ラベルにしか一致しないため `**.ts.net` にする（guchi-apps/docs の knowledge/nextjs-prisma.md）。
  allowedDevOrigins: ["**.ts.net"],
};

export default nextConfig;
