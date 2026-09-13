import { describe, expect, it } from "vitest";

import { buildFunnel, biggestDropOf, FUNNEL_STEPS } from "@/lib/metrics/funnel";

/** P5：派生漏斗的口径与边界（纯函数部分，不连数据库）。 */

describe("buildFunnel", () => {
  it("产出五步，且第一步没有转化率", () => {
    const rows = buildFunnel([10, 6, 3, 3, 1]);

    expect(rows).toHaveLength(FUNNEL_STEPS.length);
    expect(rows.map((row) => row.step)).toEqual([...FUNNEL_STEPS]);
    expect(rows[0]?.users).toBe(10);
    expect(rows[0]?.conversionFromPrevious).toBeNull();
    expect(rows[0]?.conversionFromFirst).toBeNull();
  });

  it("环比与占注册的转化率计算正确", () => {
    const rows = buildFunnel([10, 6, 3, 3, 1]);

    expect(rows[1]?.conversionFromPrevious).toBeCloseTo(0.6);
    expect(rows[1]?.conversionFromFirst).toBeCloseTo(0.6);
    expect(rows[2]?.conversionFromPrevious).toBeCloseTo(0.5);
    expect(rows[2]?.conversionFromFirst).toBeCloseTo(0.3);
    expect(rows[4]?.conversionFromPrevious).toBeCloseTo(1 / 3);
    expect(rows[4]?.conversionFromFirst).toBeCloseTo(0.1);
  });

  it("分母为 0 时转化率为 null，不产生 NaN", () => {
    const rows = buildFunnel([0, 0, 0, 0, 0]);

    for (const row of rows) {
      expect(row.users).toBe(0);
      expect(row.conversionFromPrevious).toBeNull();
      expect(row.conversionFromFirst).toBeNull();
    }
  });

  it("缺少的计数按 0 处理", () => {
    const rows = buildFunnel([7]);

    expect(rows[1]?.users).toBe(0);
    expect(rows[4]?.users).toBe(0);
    expect(rows[1]?.conversionFromPrevious).toBe(0);
  });
});

describe("biggestDropOf", () => {
  it("返回流失人数最多的一步", () => {
    const drop = biggestDropOf(buildFunnel([100, 80, 30, 28, 10]));

    expect(drop).toEqual({ from: "topic", to: "script", lost: 50 });
  });

  it("没有流失时返回 null", () => {
    expect(biggestDropOf(buildFunnel([5, 5, 5, 5, 5]))).toBeNull();
    expect(biggestDropOf([])).toBeNull();
  });
});
