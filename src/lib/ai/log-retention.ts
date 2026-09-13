import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";

/**
 * AiCallLog 清理策略（P5 起）。
 *
 * - 保留期由 AI_LOG_RETENTION_DAYS 决定（默认 90 天）
 * - 分批删除，避免一次删除过多行造成长事务与锁等待（SQLite / Postgres 都适用）
 * - 只删除日志元数据，不触碰任何业务数据
 * - 不做自动定时清理：P5 由 scripts/prune-ai-logs.mjs 手工触发，P6 再接 Vercel Cron
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 单批删除的行数上限。 */
export const AI_LOG_PRUNE_BATCH_SIZE = 500;

export type PruneResult = {
  retentionDays: number;
  cutoff: string;
  deleted: number;
  batches: number;
};

/** 保留天数：环境变量带默认值，因此这里一定有值。 */
export function aiLogRetentionDays(): number {
  return getEnv().AI_LOG_RETENTION_DAYS;
}

/** 截止时刻：早于它的日志会被删除（纯函数，便于单测）。 */
export function aiLogCutoff(retentionDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - retentionDays * MS_PER_DAY);
}

/** 统计待清理条数（dry-run 用），不写库。 */
export async function countExpiredAiLogs(cutoff: Date): Promise<number> {
  return prisma.aiCallLog.count({ where: { createdAt: { lt: cutoff } } });
}

/** 分批删除过期日志，返回删除总数。 */
export async function pruneAiCallLogs(options?: {
  retentionDays?: number;
  now?: Date;
  batchSize?: number;
}): Promise<PruneResult> {
  const retentionDays = options?.retentionDays ?? aiLogRetentionDays();
  const batchSize = options?.batchSize ?? AI_LOG_PRUNE_BATCH_SIZE;
  const cutoff = aiLogCutoff(retentionDays, options?.now ?? new Date());

  let deleted = 0;
  let batches = 0;

  for (;;) {
    const rows = await prisma.aiCallLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    if (rows.length === 0) {
      break;
    }

    const result = await prisma.aiCallLog.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });

    deleted += result.count;
    batches += 1;

    // 删不动了（并发删除等）就停手，避免死循环
    if (result.count === 0 || rows.length < batchSize) {
      break;
    }
  }

  return { retentionDays, cutoff: cutoff.toISOString(), deleted, batches };
}
