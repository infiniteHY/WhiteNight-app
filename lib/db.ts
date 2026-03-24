/**
 * lib/db.ts
 * Prisma Client 单例模式
 * Prisma v7 使用 libsql adapter 连接 SQLite
 */

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

// 声明全局变量以在开发环境中缓存 Prisma 实例
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// SQLite 数据库文件路径（与 prisma.config.ts 保持一致）
const dbUrl = process.env.DATABASE_URL || `file:${path.join(process.cwd(), "dev.db")}`;

function createPrismaClient() {
  const adapter = new PrismaLibSql({ url: dbUrl });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

/**
 * 导出单例 Prisma 客户端
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
