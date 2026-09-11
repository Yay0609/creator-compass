import { afterEach, describe, expect, it, vi } from "vitest";

import { EnvValidationError, getEnv, resetEnvCache, validateEnv } from "@/lib/env";

const VALID_SOURCE: Record<string, string> = {
  DATABASE_URL: "file:./dev.db",
  SESSION_SECRET: "x".repeat(32),
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_MODEL: "gpt-4o-mini",
  AI_DAILY_LIMIT: "20",
  QUOTA_TOPIC: "10",
  QUOTA_SCRIPT: "10",
  QUOTA_REVIEW: "5",
  APP_BASE_URL: "http://localhost:3000",
};

const ENV_KEYS = Object.keys(VALID_SOURCE);

describe("validateEnv", () => {
  it("校验通过，并把数字型变量转成 number", () => {
    const env = validateEnv(VALID_SOURCE);

    expect(env.AI_DAILY_LIMIT).toBe(20);
    expect(env.QUOTA_TOPIC).toBe(10);
    expect(env.QUOTA_REVIEW).toBe(5);
    expect(env.OPENAI_MODEL).toBe("gpt-4o-mini");
  });

  it("缺少必填变量时抛出 EnvValidationError，并指明变量名", () => {
    const source: Record<string, string> = { ...VALID_SOURCE };
    delete source.SESSION_SECRET;

    expect(() => validateEnv(source)).toThrow(EnvValidationError);

    try {
      validateEnv(source);
      throw new Error("预期 validateEnv 抛出异常，但没有");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues.join(" ")).toContain("SESSION_SECRET");
    }
  });

  it("SESSION_SECRET 少于 32 个字符时校验失败", () => {
    expect(() => validateEnv({ ...VALID_SOURCE, SESSION_SECRET: "too-short" })).toThrow(EnvValidationError);
  });

  it("数字型变量非法时校验失败", () => {
    expect(() => validateEnv({ ...VALID_SOURCE, AI_DAILY_LIMIT: "abc" })).toThrow(EnvValidationError);
  });

  it("报错信息只包含变量名与原因，不包含变量值", () => {
    try {
      validateEnv({ ...VALID_SOURCE, SESSION_SECRET: "short" });
      throw new Error("预期 validateEnv 抛出异常，但没有");
    } catch (error) {
      expect((error as EnvValidationError).message).not.toContain("short");
    }
  });
});

describe("getEnv 延迟校验", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("模块加载时不抛错（若为顶层校验，本文件根本无法执行）", () => {
    expect(typeof getEnv).toBe("function");
    expect(typeof validateEnv).toBe("function");
  });

  it("首次调用 getEnv() 才读取 process.env，缺失时抛出 EnvValidationError", () => {
    resetEnvCache();
    for (const key of ENV_KEYS) {
      vi.stubEnv(key, "");
    }

    expect(() => getEnv()).toThrow(EnvValidationError);
  });

  it("环境变量齐全时 getEnv() 返回解析后的配置", () => {
    resetEnvCache();
    for (const key of ENV_KEYS) {
      vi.stubEnv(key, VALID_SOURCE[key] ?? "");
    }

    expect(getEnv().QUOTA_SCRIPT).toBe(10);
  });
});