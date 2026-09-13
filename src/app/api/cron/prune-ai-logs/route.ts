import { timingSafeEqual } from "node:crypto";

import { pruneAiCallLogs } from "@/lib/ai/log-retention";
import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 常量时间比较，避免通过响应耗时逐字节探测密钥。 */
function isExpectedToken(header: string, secret: string): boolean {
  const left = Buffer.from(header);
  const right = Buffer.from("Bearer " + secret);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

/**
 * AiCallLog 定时清理（P6，由 Vercel Cron 每天调用一次）。
 *
 * 约定：
 * - 只复用 P5 的清理策略（src/lib/ai/log-retention.ts），不在这里另写删除逻辑
 * - 鉴权：Vercel Cron 会带上 `Authorization: Bearer $CRON_SECRET`
 * - 生产环境未配置 CRON_SECRET 时直接拒绝执行（503/500 语义），不静默放行
 * - 非生产环境未配置密钥时放行，便于本地手工验证
 * - 不做任何用户数据操作，只删过期的 AI 调用日志元数据
 */
export const GET = withRoute(async (request) => {
  const secret = getEnv().CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(ErrorCode.INTERNAL, "未配置 CRON_SECRET，已拒绝执行清理任务");
    }
    console.warn("[cron] 未配置 CRON_SECRET：非生产环境放行，仅用于本地手工验证");
  } else if (!isExpectedToken(request.headers.get("authorization") ?? "", secret)) {
    throw new ApiError(ErrorCode.UNAUTHORIZED, "Cron 鉴权失败");
  }

  const result = await pruneAiCallLogs();

  // 结果随响应回传（手工触发时可直接看到删除条数）。
  // 本仓库的 no-console 规则只放行 warn / error（见 .eslintrc.json），因此不打 info 级日志。
  return ok({ ...result, ranAt: new Date().toISOString() });
});