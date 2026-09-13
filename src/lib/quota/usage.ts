import "server-only";

import { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { AI_DAILY_KIND, AI_FEATURES, type AiFeature } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import type { ReviewUsage } from "@/lib/reviews/schemas";
import type { ScriptUsage } from "@/lib/scripts/schemas";
import type { QuotaSnapshot, TopicUsage, UsageSummary } from "@/lib/topics/schemas";

import { dailyLimitFor, featureLabel, monthlyLimitFor, type QuotaLimits } from "./limits";
import { dayPeriod, monthPeriod } from "./period";

/**
 * 配额：两层限制
 * - 日额度（AI_DAILY_LIMIT，kind=ai_daily）：全局防刷，所有功能共用
 * - 月额度（QUOTA_TOPIC / QUOTA_SCRIPT / QUOTA_REVIEW）：产品额度，按功能计数
 *
 * 关键实现约束：
 * 1. 预占必须原子：条件自增 + 唯一约束兜底，绝不 read-then-write
 * 2. 事务里只做配额读写，绝不把 AI 调用放进事务（否则会长时间持锁）
 * 3. 失败一律回滚（releaseQuota），且按「预占时的周期」回滚，跨周期不会算错
 */

export type QuotaReservation = {
  month: { period: string; kind: AiFeature; limit: number };
  day: { period: string; kind: string; limit: number };
};

type ConsumeParams = {
  userId: string;
  period: string;
  kind: string;
  limit: number;
  errorCode: ErrorCode;
  errorMessage: string;
};

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** 单个计数器的原子预占；超限则抛 ApiError（事务回滚，不会留下半扣状态）。 */
async function consume(tx: Prisma.TransactionClient, params: ConsumeParams): Promise<void> {
  if (params.limit <= 0) {
    throw new ApiError(params.errorCode, params.errorMessage);
  }

  const uniqueKey = {
    userId_period_kind: { userId: params.userId, period: params.period, kind: params.kind },
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await tx.usageCounter.findUnique({
      where: uniqueKey,
      select: { id: true, used: true },
    });

    if (existing) {
      if (existing.used >= params.limit) {
        throw new ApiError(params.errorCode, params.errorMessage);
      }

      // 条件自增：并发下由数据库保证「不会超过 limit」
      const updated = await tx.usageCounter.updateMany({
        where: { ...uniqueKey.userId_period_kind, used: { lt: params.limit } },
        data: { used: { increment: 1 } },
      });

      if (updated.count === 0) {
        throw new ApiError(params.errorCode, params.errorMessage);
      }

      return;
    }

    try {
      await tx.usageCounter.create({
        data: {
          userId: params.userId,
          period: params.period,
          kind: params.kind,
          used: 1,
        },
      });
      return;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // 首次创建的并发竞态：重试一轮即可命中上面的条件自增分支
    }
  }

  throw new ApiError(params.errorCode, params.errorMessage);
}

/** 预占一次 AI 调用额度。超限抛 429（日额度）/ 429（月额度）。 */
export async function reserveQuota(
  userId: string,
  kind: AiFeature,
  now: Date = new Date(),
): Promise<QuotaReservation> {
  const limits: QuotaLimits = getEnv();
  const month = monthPeriod(now);
  const day = dayPeriod(now);
  const monthLimit = monthlyLimitFor(kind, limits);
  const dayLimit = dailyLimitFor(limits);

  // 先扣日额度再扣月额度；任一步超限，整个事务回滚
  await prisma.$transaction(async (tx) => {
    await consume(tx, {
      userId,
      period: day,
      kind: AI_DAILY_KIND,
      limit: dayLimit,
      errorCode: ErrorCode.RATE_LIMITED,
      errorMessage: `今日 AI 调用次数已达上限（${dayLimit} 次），请明天再来`,
    });

    await consume(tx, {
      userId,
      period: month,
      kind,
      limit: monthLimit,
      errorCode: ErrorCode.QUOTA_EXCEEDED,
      errorMessage: `本月${featureLabel(kind)}额度已用完（${monthLimit} 次），下月自动恢复`,
    });
  });

  return {
    month: { period: month, kind, limit: monthLimit },
    day: { period: day, kind: AI_DAILY_KIND, limit: dayLimit },
  };
}

/** 回滚预占的额度。只按预占记录里的周期与 kind 回滚，跨周期也不会误扣新周期。 */
export async function releaseQuota(userId: string, reservation: QuotaReservation): Promise<void> {
  const entries = [reservation.day, reservation.month];

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.usageCounter.updateMany({
        where: { userId, period: entry.period, kind: entry.kind, used: { gt: 0 } },
        data: { used: { decrement: 1 } },
      }),
    ),
  );
}

function snapshotFor(
  kind: AiFeature | typeof AI_DAILY_KIND,
  period: string,
  used: number,
  limits: QuotaLimits,
): QuotaSnapshot {
  const limit = kind === AI_DAILY_KIND ? dailyLimitFor(limits) : monthlyLimitFor(kind, limits);
  return { kind, period, used, limit };
}

/** 读取当前用量（不写库），用于页面展示与生成接口的 usage 回传。 */
export async function readUsage(userId: string, now: Date = new Date()): Promise<UsageSummary> {
  const limits: QuotaLimits = getEnv();
  const month = monthPeriod(now);
  const day = dayPeriod(now);

  const rows = await prisma.usageCounter.findMany({
    where: {
      userId,
      OR: [
        { period: month, kind: { in: [...AI_FEATURES] } },
        { period: day, kind: AI_DAILY_KIND },
      ],
    },
    select: { period: true, kind: true, used: true },
  });

  const usedOf = (period: string, kind: string): number =>
    rows.find((row) => row.period === period && row.kind === kind)?.used ?? 0;

  return {
    month: {
      period: month,
      topic: snapshotFor("topic", month, usedOf(month, "topic"), limits),
      script: snapshotFor("script", month, usedOf(month, "script"), limits),
      review: snapshotFor("review", month, usedOf(month, "review"), limits),
    },
    day: {
      period: day,
      aiDaily: snapshotFor(AI_DAILY_KIND, day, usedOf(day, AI_DAILY_KIND), limits),
    },
  };
}

/** 生成接口的 SSE 只回传这两条与选题相关的用量。 */
export function toTopicUsage(summary: UsageSummary): TopicUsage {
  return { topic: summary.month.topic, aiDaily: summary.day.aiDaily };
}

/** 生成接口的 SSE 只回传这两条与脚本相关的用量。 */
export function toScriptUsage(summary: UsageSummary): ScriptUsage {
  return { script: summary.month.script, aiDaily: summary.day.aiDaily };
}

/** 生成接口的 SSE 只回传这两条与复盘相关的用量。 */
export function toReviewUsage(summary: UsageSummary): ReviewUsage {
  return { review: summary.month.review, aiDaily: summary.day.aiDaily };
}
