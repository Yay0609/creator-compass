import { NextResponse } from "next/server";

import { DEFAULT_ERROR_MESSAGE, ERROR_HTTP_STATUS, ErrorCode } from "./error-codes";

export type ApiSuccess<T> = { ok: true; data: T };

export type ApiFailure = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

export type ApiPayload<T> = ApiSuccess<T> | ApiFailure;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

type InitOptions = { status?: number };

/** 成功响应：{ ok: true, data }，默认 200 且禁用缓存。 */
export function ok<T>(data: T, init?: InitOptions): NextResponse<ApiSuccess<T>> {
  return NextResponse.json<ApiSuccess<T>>(
    { ok: true, data },
    { status: init?.status ?? 200, headers: NO_STORE_HEADERS },
  );
}

/** 失败响应：{ ok: false, error }，状态码由错误码映射决定，可显式覆盖。 */
export function fail(
  code: ErrorCode,
  message?: string,
  details?: unknown,
  init?: InitOptions,
): NextResponse<ApiFailure> {
  const error: ApiFailure["error"] = {
    code,
    message: message ?? DEFAULT_ERROR_MESSAGE[code],
  };

  if (details !== undefined) {
    error.details = details;
  }

  return NextResponse.json<ApiFailure>(
    { ok: false, error },
    { status: init?.status ?? ERROR_HTTP_STATUS[code], headers: NO_STORE_HEADERS },
  );
}