import { PrismaClient } from "@prisma/client";

// Next.jsの開発サーバーはホットリロードのたびにモジュールを再評価するため、
// グローバルへキャッシュしないと接続のたびにPrismaClientが増殖する。
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
