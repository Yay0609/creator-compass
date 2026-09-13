import { describe, expect, it } from "vitest";

import { dailyLimitFor, featureLabel, monthlyLimitFor, type QuotaLimits } from "@/lib/quota/limits";

const LIMITS: QuotaLimits = {
  AI_DAILY_LIMIT: 20,
  QUOTA_TOPIC: 10,
  QUOTA_SCRIPT: 10,
  QUOTA_REVIEW: 5,
};

describe("配额限额解析", () => {
  it("月额度按功能取对应环境变量", () => {
    expect(monthlyLimitFor("topic", LIMITS)).toBe(10);
    expect(monthlyLimitFor("script", LIMITS)).toBe(10);
    expect(monthlyLimitFor("review", LIMITS)).toBe(5);
  });

  it("日额度独立于功能，来自 AI_DAILY_LIMIT", () => {
    expect(dailyLimitFor(LIMITS)).toBe(20);
    expect(dailyLimitFor({ ...LIMITS, AI_DAILY_LIMIT: 1 })).toBe(1);
  });

  it("额度为 0 时语义为「完全关闭」", () => {
    expect(monthlyLimitFor("review", { ...LIMITS, QUOTA_REVIEW: 0 })).toBe(0);
  });

  it("功能中文名用于错误提示", () => {
    expect(featureLabel("topic")).toBe("选题");
    expect(featureLabel("script")).toBe("脚本");
    expect(featureLabel("review")).toBe("复盘");
  });
});
