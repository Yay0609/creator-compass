import { randomUUID } from "node:crypto";

import { AiError } from "@/lib/ai/errors";
import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { createSseResponse } from "@/lib/api/sse";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { computeBaseline } from "@/lib/posts/schemas";
import { readUsage, releaseQuota, reserveQuota, toReviewUsage } from "@/lib/quota/usage";
import { generateReviewSchema } from "@/lib/reviews/schemas";
import {
  AiReviewInvalidOutputError,
  BASELINE_SAMPLE_LIMIT,
  baselineSourceOf,
  generateReview,
} from "@/lib/reviews/service";
import { SSE_EVENTS } from "@/lib/topics/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 异常 -> SSE error 负载。绝不回传堆栈、上游原文或任何密钥。 */
function toErrorPayload(error: unknown): { code: string; message: string; details?: unknown } {
  if (error instanceof AiReviewInvalidOutputError) {
    return {
      code: ErrorCode.AI_INVALID_OUTPUT,
      message: error.message,
      details: { draft: error.draft, issues: error.issues },
    };
  }

  if (error instanceof ApiError) {
    return { code: error.code, message: error.message, details: error.details };
  }

  if (error instanceof AiError) {
    return { code: ErrorCode.AI_UNAVAILABLE, message: error.message };
  }

  console.error("[reviews] 生成失败", error);
  return { code: ErrorCode.INTERNAL, message: "服务内部错误，请稍后重试" };
}

/**
 * 生成复盘报告（SSE 流式）。
 *
 * 时序：
 * 1. 校验入参 / 画像 / 作品归属 -> 2. 预占配额（失败直接返回普通 JSON 429） -> 3. 开流
 * 4. meta -> progress* -> [progress(repairing)] -> review -> done
 * 5. 任何未产出可用结果的失败都在回滚分支里回滚配额
 *
 * 注意：配额事务已在开流前结束，AI 调用绝不放在事务里。
 */
export const POST = withAuthedRoute(async (request, _context, user) => {
  const input = generateReviewSchema.parse(await readJson(request));

  const profile = await prisma.creatorProfile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (!profile) {
    throw new ApiError(ErrorCode.NOT_FOUND, "请先完成账号画像");
  }

  // 去重后按 id 查询，必须全部属于本人：数量不一致说明有作品不存在或不属于当前账号
  const uniqueIds = Array.from(new Set(input.postIds));
  const posts = await prisma.postRecord.findMany({
    where: { userId: user.id, id: { in: uniqueIds } },
    orderBy: [{ publishedAt: "asc" }, { createdAt: "asc" }],
  });

  if (posts.length !== uniqueIds.length) {
    throw new ApiError(ErrorCode.NOT_FOUND, "有作品不存在或不属于当前账号");
  }

  // 基线口径：账号全部历史作品（排除本次纳入的作品），只取最近 N 条保证统计稳定
  const baselinePosts = await prisma.postRecord.findMany({
    where: { userId: user.id, id: { notIn: uniqueIds } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: BASELINE_SAMPLE_LIMIT,
  });

  const baseline = computeBaseline(baselinePosts.map(baselineSourceOf));

  const reservation = await reserveQuota(user.id, "review");
  let settled = false;

  const rollback = async (): Promise<void> => {
    if (settled) {
      return;
    }
    settled = true;

    try {
      await releaseQuota(user.id, reservation);
    } catch (error) {
      console.error("[reviews] 配额回滚失败", error);
    }
  };

  const batchId = randomUUID();
  const usage = toReviewUsage(await readUsage(user.id));

  return createSseResponse(async (sse) => {
    sse.send(SSE_EVENTS.meta, {
      batchId,
      model: getEnv().OPENAI_MODEL,
      postCount: posts.length,
      sampleSize: baseline.sampleSize,
      periodStart: baseline.periodStart,
      periodEnd: baseline.periodEnd,
      usage,
    });

    try {
      const result = await generateReview({
        userId: user.id,
        profile,
        posts,
        baselinePosts,
        batchId,
        focus: input.focus ?? null,
        signal: request.signal,
        onProgress: (progress) => sse.send(SSE_EVENTS.progress, progress),
      });

      // 已产出可用结果：配额正式消耗，不再回滚
      settled = true;

      sse.send(SSE_EVENTS.review, { review: result.review });

      sse.send(SSE_EVENTS.done, {
        batchId,
        reviewId: result.review.id,
        latencyMs: result.latencyMs,
        usage: toReviewUsage(await readUsage(user.id)),
      });
    } catch (error) {
      await rollback();
      sse.send(SSE_EVENTS.error, toErrorPayload(error));
    }
  });
});