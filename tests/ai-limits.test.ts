import { afterEach, describe, expect, it, vi } from "vitest";

import { callChatJson } from "@/lib/ai/provider";
import {
  AI_MAX_TOKENS_FALLBACK,
  AI_MAX_TOKENS_LIMIT,
  AI_TIMEOUT_MS_FALLBACK,
} from "@/lib/constants";
import { EnvValidationError, resetEnvCache, validateEnv } from "@/lib/env";

/** P5：AI 限额相关环境变量的默认值、边界与生效路径。 */

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

function stubFetch(bodies: Record<string, unknown>[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      bodies.push(
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {},
      );
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "{}" } }],
          usage: { total_tokens: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

describe("AI 限额环境变量", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetEnvCache();
  });

  it("留空与缺失都回落到默认值", () => {
    const blank = validateEnv({ ...BASE_ENV, AI_MAX_TOKENS: "", AI_TIMEOUT_MS: "" });
    expect(blank.AI_MAX_TOKENS).toBe(AI_MAX_TOKENS_FALLBACK);
    expect(blank.AI_TIMEOUT_MS).toBe(AI_TIMEOUT_MS_FALLBACK);
    expect(blank.AI_LOG_RETENTION_DAYS).toBe(90);

    const missing = validateEnv(BASE_ENV);
    expect(missing.AI_MAX_TOKENS).toBe(AI_MAX_TOKENS_FALLBACK);
    expect(missing.AI_TIMEOUT_MS).toBe(AI_TIMEOUT_MS_FALLBACK);
  });

  it("超出允许区间时校验失败，且报错不含变量值", () => {
    expect(() => validateEnv({ ...BASE_ENV, AI_MAX_TOKENS: "99999" })).toThrow(EnvValidationError);
    expect(() => validateEnv({ ...BASE_ENV, AI_TIMEOUT_MS: "600000" })).toThrow(EnvValidationError);
    expect(() => validateEnv({ ...BASE_ENV, AI_TIMEOUT_MS: "100" })).toThrow(EnvValidationError);
    expect(() => validateEnv({ ...BASE_ENV, AI_LOG_RETENTION_DAYS: "0" })).toThrow(EnvValidationError);
  });

  it("网关按环境变量发送 max_tokens", async () => {
    vi.stubEnv("AI_MAX_TOKENS", "1234");
    for (const [key, value] of Object.entries(BASE_ENV)) {
      vi.stubEnv(key, value);
    }
    resetEnvCache();

    const bodies: Record<string, unknown>[] = [];
    stubFetch(bodies);

    await callChatJson({ messages: [{ role: "user", content: "hi" }] });

    expect(bodies[0]?.["max_tokens"]).toBe(1234);
  });

  it("调用方传入超大 max_tokens 时被硬上限截断", async () => {
    for (const [key, value] of Object.entries(BASE_ENV)) {
      vi.stubEnv(key, value);
    }
    resetEnvCache();

    const bodies: Record<string, unknown>[] = [];
    stubFetch(bodies);

    await callChatJson({ messages: [{ role: "user", content: "hi" }], maxTokens: 999_999 });

    expect(bodies[0]?.["max_tokens"]).toBe(AI_MAX_TOKENS_LIMIT);
  });
});
