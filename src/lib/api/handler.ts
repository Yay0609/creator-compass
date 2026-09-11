import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { EnvValidationError } from "@/lib/env";

import { ApiError } from "./api-error";
import { ErrorCode } from "./error-codes";
import { fail } from "./response";

export type RouteContext = Record<string, unknown>;

export type RouteHandler<Ctx> = (
  request: Request,
  context: Ctx,
) => Promise<NextResponse> | NextResponse;

/**
 * 路由处理器包装器：统一错误归一化与日志。
 * P0 只做兜底；鉴权（requireUser）将在 P1 通过 options 参数注入。
 */
export function withRoute<Ctx = RouteContext>(handler: RouteHandler<Ctx>) {
  return async (request: Request, context: Ctx): Promise<NextResponse> => {
    const startedAt = Date.now();

    try {
      return await handler(request, context);
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      if (error instanceof ApiError) {
        return fail(error.code, error.message, error.details);
      }

      if (error instanceof ZodError) {
        return fail(ErrorCode.VALIDATION_FAILED, undefined, error.flatten());
      }

      if (error instanceof EnvValidationError) {
        console.error("[api] 环境变量校验失败", { url: request.url, durationMs, issues: error.issues });
        return fail(ErrorCode.INTERNAL, "服务配置缺失，请检查 .env（详情见服务端日志）");
      }

      console.error("[api] 未处理异常", { url: request.url, durationMs, error });
      return fail(ErrorCode.INTERNAL);
    }
  };
}