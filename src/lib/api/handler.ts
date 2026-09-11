import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireUserForApi, type CurrentUser } from "@/lib/auth/session";
import { EnvValidationError } from "@/lib/env";

import { ApiError } from "./api-error";
import { ErrorCode } from "./error-codes";
import { fail } from "./response";

export type RouteContext = Record<string, unknown>;

export type RouteHandler<Ctx> = (
  request: Request,
  context: Ctx,
) => Promise<NextResponse> | NextResponse;

export type AuthedRouteHandler<Ctx> = (
  request: Request,
  context: Ctx,
  user: CurrentUser,
) => Promise<NextResponse> | NextResponse;

/**
 * 路由处理器包装器：统一错误归一化与日志。
 * 鉴权请使用 withAuthedRoute()，或在处理器内显式调用 requireUserForApi()。
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

/**
 * 需要登录的路由包装器：未登录返回 401，并把当前用户注入处理器。
 * 所有涉及用户数据的读写都必须使用它（或显式调用 requireUserForApi），
 * 并在查询条件中带上 userId，避免越权。
 */
export function withAuthedRoute<Ctx = RouteContext>(handler: AuthedRouteHandler<Ctx>) {
  return withRoute<Ctx>(async (request, context) => {
    const user = await requireUserForApi();
    return handler(request, context, user);
  });
}