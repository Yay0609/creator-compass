import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/api-error";
import { ERROR_HTTP_STATUS, ErrorCode } from "@/lib/api/error-codes";
import { withRoute } from "@/lib/api/handler";
import { fail, ok } from "@/lib/api/response";

describe("统一响应封装", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ok() 返回 200、{ ok: true, data } 且禁用缓存", async () => {
    const response = ok({ message: "创作罗盘" });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true, data: { message: "创作罗盘" } });
  });

  it("fail() 使用错误码对应的 HTTP 状态与默认文案", async () => {
    const response = fail(ErrorCode.QUOTA_EXCEEDED);

    expect(response.status).toBe(ERROR_HTTP_STATUS.QUOTA_EXCEEDED);

    const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("QUOTA_EXCEEDED");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it("fail() 允许覆盖状态码并透传 details", async () => {
    const response = fail(ErrorCode.INTERNAL, undefined, { hint: "detail" }, { status: 503 });

    expect(response.status).toBe(503);

    const body = (await response.json()) as { error: { details?: unknown } };
    expect(body.error.details).toEqual({ hint: "detail" });
  });

  it("withRoute 把 ApiError 映射为对应状态码与错误码", async () => {
    const handler = withRoute(async () => {
      throw new ApiError(ErrorCode.NOT_FOUND);
    });

    const response = await handler(new Request("http://localhost/api/test"), {});

    expect(response.status).toBe(404);

    const body = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("withRoute 把未知异常兜底为 500 INTERNAL", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const handler = withRoute(async () => {
      throw new Error("boom");
    });

    const response = await handler(new Request("http://localhost/api/test"), {});

    expect(response.status).toBe(500);

    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INTERNAL");
  });
});