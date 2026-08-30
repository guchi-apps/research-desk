import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tailscale経由（サブPCの開発サーバーをtailnetへ公開）でアクセスするための許可設定。
  // `*` は1ラベルにしか一致しないため `**.ts.net` にする（guchi-apps/docs の knowledge/nextjs-prisma.md）。
  allowedDevOrigins: ["**.ts.net"],
};

export default nextConfig;
