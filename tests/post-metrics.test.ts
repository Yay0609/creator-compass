import { describe, expect, it } from "vitest";

import { computeBaseline, computePostMetrics, type BaselineSource } from "@/lib/posts/schemas";

function source(overrides: Partial<BaselineSource> = {}): BaselineSource {
  return {
    views: null,
    impressions: null,
    likes: null,
    comments: null,
    saves: null,
    shares: null,
    followsGained: null,
    completionRate: null,
    publishedAt: new Date("2026-09-01T04:00:00.000Z"),
    ...overrides,
  };
}

describe("computePostMetrics", () => {
  it("派生比率保留 4 位小数", () => {
    const metrics = computePostMetrics({
      views: 1000,
      impressions: 5000,
      likes: 50,
      comments: 10,
      saves: 20,
      shares: 5,
      followsGained: 8,
    });

    expect(metrics.likeRate).toBe(0.05);
    expect(metrics.commentRate).toBe(0.01);
    expect(metrics.saveRate).toBe(0.02);
    expect(metrics.shareRate).toBe(0.005);
    expect(metrics.interactionRate).toBe(0.085);
    expect(metrics.followRate).toBe(0.008);
    expect(metrics.playRate).toBe(0.2);
  });

  it("分母缺失或为 0 时返回 null，不写 0", () => {
    const metrics = computePostMetrics({
      views: null,
      impressions: 0,
      likes: 10,
      comments: null,
      saves: null,
      shares: null,
      followsGained: null,
    });

    expect(metrics.likeRate).toBeNull();
    expect(metrics.interactionRate).toBeNull();
    expect(metrics.playRate).toBeNull();
    expect(metrics.followRate).toBeNull();
  });
});

describe("computeBaseline", () => {
  it("按均值 / 中位数 / 区间统计，并标注样本数", () => {
    const baseline = computeBaseline([
      source({ views: 100, publishedAt: new Date("2026-08-01T04:00:00.000Z") }),
      source({ views: 200, publishedAt: new Date("2026-08-02T04:00:00.000Z") }),
      source({ views: 300, publishedAt: new Date("2026-08-03T04:00:00.000Z") }),
    ]);

    const views = baseline.metrics.find((metric) => metric.key === "views");
    expect(baseline.sampleSize).toBe(3);
    expect(views?.sampleSize).toBe(3);
    expect(views?.mean).toBe(200);
    expect(views?.median).toBe(200);
    expect(views?.min).toBe(100);
    expect(views?.max).toBe(300);
    expect(baseline.periodStart).toBe("2026-08-01T04:00:00.000Z");
    expect(baseline.periodEnd).toBe("2026-08-03T04:00:00.000Z");
  });

  it("偶数样本取中间两个的平均值", () => {
    const baseline = computeBaseline([
      source({ views: 100 }),
      source({ views: 200 }),
      source({ views: 300 }),
      source({ views: 400 }),
    ]);

    const views = baseline.metrics.find((metric) => metric.key === "views");
    expect(views?.median).toBe(250);
    expect(views?.mean).toBe(250);
  });

  it("缺少某指标的样本只统计有值的部分", () => {
    const baseline = computeBaseline([
      source({ likes: 10 }),
      source({ likes: null }),
      source({ likes: 30 }),
    ]);

    const likes = baseline.metrics.find((metric) => metric.key === "likes");
    expect(likes?.sampleSize).toBe(2);
    expect(likes?.mean).toBe(20);

    const saves = baseline.metrics.find((metric) => metric.key === "saves");
    expect(saves?.sampleSize).toBe(0);
    expect(saves?.mean).toBeNull();
  });
});