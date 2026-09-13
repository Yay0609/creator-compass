import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), deleteMany: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { aiCallLog: { findMany: mocks.findMany, deleteMany: mocks.deleteMany } },
}));

import { AI_LOG_PRUNE_BATCH_SIZE, aiLogCutoff, pruneAiCallLogs } from "@/lib/ai/log-retention";
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

/** 让 getEnv() 拿到完整的测试环境变量。 */
function stubEnv(extra?: Record<string, string>): void {
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...extra })) {
    vi.stubEnv(key, value);
  }
  resetEnvCache();
}

describe("AiCallLog 保留期", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    resetEnvCache();
  });

  it("截止时间按天回推", () => {
    const now = new Date("2026-09-13T00:00:00.000Z");
    expect(aiLogCutoff(90, now).toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(aiLogCutoff(1, now).toISOString()).toBe("2026-09-12T00:00:00.000Z");
    expect(aiLogCutoff(0, now).toISOString()).toBe(now.toISOString());
  });

  it("按批次删除，直到剩余不足一批就收尾", async () => {
    stubEnv();

    const firstBatch = Array.from({ length: AI_LOG_PRUNE_BATCH_SIZE }, (_item, index) => ({
      id: "log-" + index,
    }));
    mocks.findMany
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([{ id: "log-tail" }]);
    mocks.deleteMany
      .mockResolvedValueOnce({ count: AI_LOG_PRUNE_BATCH_SIZE })
      .mockResolvedValueOnce({ count: 1 });

    const result = await pruneAiCallLogs();

    expect(result.deleted).toBe(AI_LOG_PRUNE_BATCH_SIZE + 1);
    expect(result.batches).toBe(2);
    expect(result.retentionDays).toBe(90);
    // 第二批不足一批，直接收尾：一共查询两次、删除两次
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(2);
  });

  it("保留期取环境变量", async () => {
    stubEnv({ AI_LOG_RETENTION_DAYS: "30" });
    mocks.findMany.mockResolvedValue([]);

    const result = await pruneAiCallLogs();

    expect(result.retentionDays).toBe(30);
    expect(result.deleted).toBe(0);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("删除不生效时立即停止，不会死循环", async () => {
    stubEnv();
    mocks.findMany.mockResolvedValue([{ id: "log-1" }]);
    mocks.deleteMany.mockResolvedValue({ count: 0 });

    const result = await pruneAiCallLogs({ retentionDays: 30 });

    expect(result.deleted).toBe(0);
    expect(result.batches).toBe(1);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
  });
});
