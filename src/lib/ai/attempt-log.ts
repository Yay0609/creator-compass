import "server-only";

import { prisma } from "@/lib/db/prisma";

import type { AiAttempt } from "./errors";

/**
 * AI 调用留痕（选题 / 脚本共用）。
 * 只写元数据：绝不记录 prompt 原文与模型原始输出。
 */

export type AttemptLogMeta = { promptChars: number; outputChars: number };

export type AttemptLogger = {
  write: (attempts: AiAttempt[], meta: AttemptLogMeta) => Promise<void>;
};

/**
 * 每次尝试都落一条 AiCallLog（含重试与失败）。
 * 客户端已断开或写库失败都不影响主流程。
 */
export function createAttemptLogger(options: {
  userId: string;
  kind: string;
  model: string;
  requestId: string;
  signal?: AbortSignal;
}): AttemptLogger {
  return {
    async write(attempts, meta) {
      if (options.signal?.aborted || attempts.length === 0) {
        return;
      }

      try {
        await prisma.$transaction(
          attempts.map((attempt) =>
            prisma.aiCallLog.create({
              data: {
                userId: options.userId,
                kind: options.kind,
                model: options.model,
                status: attempt.status,
                attempt: attempt.attempt,
                httpStatus: attempt.httpStatus,
                latencyMs: attempt.latencyMs,
                errorCode: attempt.errorCode,
                totalTokens: attempt.totalTokens,
                promptChars: meta.promptChars,
                outputChars: meta.outputChars,
                requestId: options.requestId,
              },
            }),
          ),
        );
      } catch (error) {
        console.error("[ai] 写入 AiCallLog 失败", error);
      }
    },
  };
}