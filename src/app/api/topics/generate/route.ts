import { randomUUID } from "node:crypto";

import { AiError } from "@/lib/ai/errors";
import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { createSseResponse } from "@/lib/api/sse";
import { TOPIC_BATCH_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { readUsage, releaseQuota, reserveQuota, toTopicUsage } from "@/lib/quota/usage";
import { SSE_EVENTS, generateTopicsSchema } from "@/lib/topics/schemas";
import { AiInvalidOutputError, generateTopics } from "@/lib/topics/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 异常 -> SSE error 负载。绝不回传堆栈、上游原文或任何密钥。 */
function toErrorPayload(error: unknown): { code: string; message: string; details?: unknown } {
  if (error instanceof AiInvalidOutputError) {
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

  console.error("[topics] 生成失败", error);
  return { code: ErrorCode.INTERNAL, message: "服务内部错误，请稍后重试" };
}

/**
 * 生成选题（SSE 流式）。
 *
 * 时序：
 * 1. 校验入参与画像 -> 2. 预占配额（失败直接返回普通 JSON 429） -> 3. 开流
 * 4. meta -> progress* -> [progress(repairing)] -> topic × 5 -> done
 * 5. 任何未产出可用结果的失败都在回滚分支里回滚配额
 *
 * 注意：配额事务已在开流前结束，AI 调用绝不放在事务里。
 */
export const POST = withAuthedRoute(async (request, _context, user) => {
  const input = generateTopicsSchema.parse(await readJson(request));

  const profile = await prisma.creatorProfile.findFirst({
    where: input.profileId ? { id: input.profileId, userId: user.id } : { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (!profile) {
    throw new ApiError(ErrorCode.NOT_FOUND, "请先完成账号画像");
  }

  const reservation = await reserveQuota(user.id, "topic");
  let settled = false;

  const rollback = async (): Promise<void> => {
    if (settled) {
      return;
    }
    settled = true;

    try {
      await releaseQuota(user.id, reservation);
    } catch (error) {
      console.error("[topics] 配额回滚失败", error);
    }
  };

  const batchId = randomUUID();
  const usage = toTopicUsage(await readUsage(user.id));

  return createSseResponse(async (sse) => {
    sse.send(SSE_EVENTS.meta, {
      batchId,
      model: getEnv().OPENAI_MODEL,
      count: TOPIC_BATCH_SIZE,
      usage,
    });

    try {
      const result = await generateTopics({
        userId: user.id,
        profile,
        batchId,
        extraNote: input.extraNote ?? null,
        excludeTitles: input.excludeTitles ?? [],
        signal: request.signal,
        onProgress: (progress) => sse.send(SSE_EVENTS.progress, progress),
      });

      result.topics.forEach((topic, index) => {
        sse.send(SSE_EVENTS.topic, { index, topic });
      });

      // 已产出可用结果：配额正式消耗，不再回滚
      settled = true;

      sse.send(SSE_EVENTS.done, {
        batchId,
        created: result.topics.length,
        latencyMs: result.latencyMs,
        usage: toTopicUsage(await readUsage(user.id)),
      });
    } catch (error) {
      await rollback();
      sse.send(SSE_EVENTS.error, toErrorPayload(error));
    }
  });
});
