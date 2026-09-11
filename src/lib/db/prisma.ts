import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// 开发环境热更新时会重复求值模块，挂到 globalThis 避免连接数暴涨
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}