import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiError } from "@/lib/ai/errors";
import { callChatJson } from "@/lib/ai/provider";
import { AI_MAX_TOKENS } from "@/lib/constants";
import { resetEnvCache } from "@/lib/env";

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: "file:./dev.db",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  OPENAI_API_KEY: "sk-test-key",
  OPENAI_BASE_URL: "http://127.0.0.1:4010/v1",
  OPENAI_MODEL: "mock-model",
  AI_DAILY_LIMIT: "20",
  QUOTA_TOPIC: "10",
  QUOTA_SCRIPT: "10",
  QUOTA_REVIEW: "5",
  APP_BASE_URL: "http://localhost:3000",
};

const MESSAGES = [{ role: "user" as const, content: "生成选题" }];

type FetchCall = { url: string; body: Record<string, unknown> };

function completionResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content: '{"items":[]}' } }],
      usage: { total_tokens: 42 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function errorResponse(status: number, message = "mock error"): Response {
  return new Response(JSON.stringify({ error: { message } }), { status });
}

/** 把 fetch 换成可编排的桩，并记录每次请求体（用于断言参数）。 */
function stubFetch(
  handler: (call: FetchCall, index: number, init?: RequestInit) => Promise<Response>,
): FetchCall[] {
  const calls: FetchCall[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const body =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      const call = { url: String(input), body };
      calls.push(call);
      return handler(call, calls.length - 1, init);
    }),
  );

  return calls;
}

/** 永不返回的 fetch：只在被 abort 时 reject，用于验证超时与取消。 */
function hangingFetch(): FetchCall[] {
  return stubFetch(
    (_call, _index, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
  );
}

describe("AI 网关：超时、重试与降级", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(BASE_ENV)) {
      process.env[key] = value;
    }
    resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetEnvCache();
  });

  it("请求发往 baseUrl 下的 /chat/completions，并带上鉴权头", async () => {
    const calls = stubFetch(() => Promise.resolve(completionResponse()));
    await callChatJson({ messages: MESSAGES });

    expect(calls[0]?.url).toBe("http://127.0.0.1:4010/v1/chat/completions");
    expect(calls[0]?.body["model"]).toBe("mock-model");
    expect(calls[0]?.body["response_format"]).toEqual({ type: "json_object" });
  });

  it("max_tokens 被硬上限截断", async () => {
    const calls = stubFetch(() => Promise.resolve(completionResponse()));
    await callChatJson({ messages: MESSAGES, maxTokens: 999_999 });

    expect(calls[0]?.body["max_tokens"]).toBe(AI_MAX_TOKENS);
  });

  it("429 后自动重试并成功", async () => {
    const calls = stubFetch((_call, index) =>
      index === 0
        ? Promise.resolve(errorResponse(429, "rate limited"))
        : Promise.resolve(completionResponse()),
    );

    const result = await callChatJson({ messages: MESSAGES, retryDelayMs: 1 });

    expect(calls).toHaveLength(2);
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(["rate_limited", "ok"]);
    expect(result.usage.totalTokens).toBe(42);
    expect(result.text).toBe('{"items":[]}');
  });

  it("连续 5xx 用尽 3 次尝试后抛错，并回填尝试明细供落库", async () => {
    const calls = stubFetch(() => Promise.resolve(errorResponse(500, "boom")));

    const error = await callChatJson({ messages: MESSAGES, retryDelayMs: 1 }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).code).toBe("http_error");
    expect((error as AiError).attempts).toHaveLength(3);
    expect((error as AiError).attempts.every((attempt) => attempt.status === "error")).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it("上游不支持 response_format 时自动去掉该参数重试（不占用重试预算）", async () => {
    const calls = stubFetch((call) =>
      call.body["response_format"] !== undefined
        ? Promise.resolve(errorResponse(400, "response_format is not supported"))
        : Promise.resolve(completionResponse()),
    );

    const result = await callChatJson({ messages: MESSAGES, retryDelayMs: 1 });

    expect(calls).toHaveLength(2);
    expect(calls[1]?.body["response_format"]).toBeUndefined();
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(["error", "ok"]);
  });

  it("401 这类不可重试错误立即失败", async () => {
    const calls = stubFetch(() => Promise.resolve(errorResponse(401, "invalid api key")));

    const error = await callChatJson({ messages: MESSAGES, retryDelayMs: 1 }).catch(
      (caught: unknown) => caught,
    );

    expect((error as AiError).code).toBe("http_error");
    expect(calls).toHaveLength(1);
  });

  it("超时抛 timeout 且不重试（避免等待时间翻倍）", async () => {
    const calls = hangingFetch();

    const error = await callChatJson({
      messages: MESSAGES,
      timeoutMs: 20,
      retryDelayMs: 1,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).code).toBe("timeout");
    expect((error as AiError).retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("外部取消（客户端断开）抛 aborted", async () => {
    hangingFetch();
    const controller = new AbortController();

    const pending = callChatJson({
      messages: MESSAGES,
      signal: controller.signal,
      timeoutMs: 5_000,
      retryDelayMs: 1,
    });

    controller.abort();

    const error = await pending.catch((caught: unknown) => caught);
    expect((error as AiError).code).toBe("aborted");
  });

  it("响应结构不符合 OpenAI 兼容格式时抛 invalid_json", async () => {
    stubFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ unexpected: true }), { status: 200 })),
    );

    const error = await callChatJson({ messages: MESSAGES }).catch((caught: unknown) => caught);
    expect((error as AiError).code).toBe("invalid_json");
  });
});
