#!/usr/bin/env node
// CI（スクリーンショット撮影・動作確認）向けのダミーデータ投入。共有ワークフローが
// `db:seed:ci` という名前でこのスクリプトを呼ぶ契約になっている（名前が違うと無言で
// スキップされる。guchi-apps/docs の guides/new-app-checklist.md）。
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DUMMY_CLIPS = [
  {
    title: "サンプルクリップ: リサーチメモの書き方",
    url: "https://example.com/articles/research-memo",
    content: "リサーチメモを構造化して残すコツについてのメモ。",
    source: "example.com",
  },
  {
    title: "サンプルクリップ: AI要約ツールの比較",
    url: "https://example.com/articles/ai-summary-tools",
    content: "Claude／ChatGPTでの要約結果を比較したメモ。",
    source: "example.com",
  },
];

async function main() {
  for (const clip of DUMMY_CLIPS) {
    await prisma.clip.create({ data: clip });
  }
  console.log(`Seeded ${DUMMY_CLIPS.length} clip(s) for CI.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
