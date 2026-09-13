import { describe, expect, it } from "vitest";

import { dayPeriod, monthPeriod } from "@/lib/quota/period";

describe("配额周期（Asia/Shanghai）", () => {
  it("UTC 15:59 仍属于当天", () => {
    expect(dayPeriod(new Date("2026-09-13T15:59:00Z"))).toBe("2026-09-13");
  });

  it("UTC 16:00 进入北京时间次日", () => {
    expect(dayPeriod(new Date("2026-09-13T16:00:00Z"))).toBe("2026-09-14");
  });

  it("月末跨月时月周期与日周期同时切换", () => {
    const instant = new Date("2026-09-30T16:00:00Z");
    expect(monthPeriod(instant)).toBe("2026-10");
    expect(dayPeriod(instant)).toBe("2026-10-01");
  });

  it("月份与日期补零", () => {
    expect(monthPeriod(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01");
    expect(dayPeriod(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });

  it("跨年边界", () => {
    const instant = new Date("2026-12-31T16:00:00Z");
    expect(monthPeriod(instant)).toBe("2027-01");
    expect(dayPeriod(instant)).toBe("2027-01-01");
  });
});
