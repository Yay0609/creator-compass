#!/usr/bin/env node
/**
 * AiCallLog 清理脚本（P5）。
 *
 * 用法：
 *   node scripts/prune-ai-logs.mjs            # dry-run：只统计，不删除
 *   node scripts/prune-ai-logs.mjs --yes      # 真正执行删除
 *
 * 保留期由 .env 的 AI_LOG_RETENTION_DAYS 决定（默认 90 天）。
 * 只删除 ai_call_log 表里早于截止时间的行，不触碰任何业务数据。
 * 脚本不进生产构建；部署环境请改用 P6 的定时任务调用同一套策略。
 */

import { PrismaClient } from "@prisma/client";

import { envNumber, loadEnvFile } from "./load-env.mjs";

const BATCH_SIZE = 500;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function main() {
  loadEnvFile();

  if (!process.env.DATABASE_URL) {
    console.error("缺少 DATABASE_URL：请在项目根目录的 .env 中配置后再运行。");
    process.exitCode = 1;
    return;
  }

  const dryRun = !process.argv.slice(2).includes("--yes");
  const retentionDays = envNumber("AI_LOG_RETENTION_DAYS", 90);
  const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY);

  const prisma = new PrismaClient();

  try {
    const pending = await prisma.aiCallLog.count({ where: { createdAt: { lt: cutoff } } });

    console.log("AiCallLog 清理（保留 " + retentionDays + " 天）");
    console.log("截止时间：" + cutoff.toISOString());
    console.log("待清理条数：" + pending);

    if (dryRun) {
      console.log("当前是 dry-run，未删除任何数据；确认后加 --yes 再执行。");
      return;
    }

    let deleted = 0;
    let batches = 0;

    for (;;) {
      const rows = await prisma.aiCallLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: BATCH_SIZE,
      });

      if (rows.length === 0) {
        break;
      }

      const result = await prisma.aiCallLog.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });

      deleted += result.count;
      batches += 1;

      if (result.count === 0 || rows.length < BATCH_SIZE) {
        break;
      }
    }

    console.log("已删除 " + deleted + " 条（" + batches + " 批）。");
  } finally {
    await prisma.$disconnect();
  }
}

await main();
