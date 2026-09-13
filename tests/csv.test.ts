import { describe, expect, it } from "vitest";

import {
  analyzeCsv,
  autoMapColumns,
  normalizeCount,
  normalizePlatform,
  normalizeRate,
  parseCsv,
  parseDateInput,
  postDuplicateKey,
  toShanghaiDateString,
} from "@/lib/posts/csv";

function shanghaiYear(): number {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear();
}

describe("parseCsv", () => {
  it("解析引号、转义引号与逗号", () => {
    expect(parseCsv('a,b\n"x,1",2')).toEqual([
      ["a", "b"],
      ["x,1", "2"],
    ]);

    expect(parseCsv('t\n"he said ""hi"""')).toEqual([["t"], ['he said "hi"']]);
  });

  it("兼容 CRLF 与字段内换行", () => {
    expect(parseCsv('a,b\r\n"line1\nline2",2')).toEqual([
      ["a", "b"],
      ["line1\nline2", "2"],
    ]);
  });

  it("从 Excel 粘贴的制表符也能识别", () => {
    expect(parseCsv("标题\t播放\n作品 A\t1200")).toEqual([
      ["标题", "播放"],
      ["作品 A", "1200"],
    ]);
  });

  it("丢弃完全空白的行", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("autoMapColumns", () => {
  it("按别名识别常见中文表头", () => {
    const mapping = autoMapColumns(["标题", "发布时间", "播放量", "曝光", "涨粉", "奇怪列"]);
    expect(mapping).toEqual({
      "0": "title",
      "1": "publishedAt",
      "2": "views",
      "3": "impressions",
      "4": "followsGained",
    });
  });
});

describe("normalizeCount", () => {
  it("支持千分位与万 / k 单位", () => {
    expect(normalizeCount("1,234")).toEqual({ ok: true, value: 1234 });
    expect(normalizeCount("1.2万")).toEqual({ ok: true, value: 12000 });
    expect(normalizeCount("12k")).toEqual({ ok: true, value: 12000 });
  });

  it("空值按未提供处理，非法值报错", () => {
    expect(normalizeCount("")).toEqual({ ok: true, value: null });
    expect(normalizeCount("—")).toEqual({ ok: true, value: null });
    expect(normalizeCount("约一千").ok).toBe(false);
  });
});

describe("normalizeRate", () => {
  it("百分比与小数统一归一化到 0–1", () => {
    expect(normalizeRate("35%")).toEqual({ ok: true, value: 0.35 });
    expect(normalizeRate("35")).toEqual({ ok: true, value: 0.35 });
    expect(normalizeRate("0.35")).toEqual({ ok: true, value: 0.35 });
  });

  it("空值按未提供处理，超过 100% 报错", () => {
    expect(normalizeRate("无")).toEqual({ ok: true, value: null });
    expect(normalizeRate("120%").ok).toBe(false);
  });
});

describe("parseDateInput", () => {
  it("支持多种日期写法并补当年", () => {
    const first = parseDateInput("2026-09-01");
    expect(first).not.toBeNull();
    expect(toShanghaiDateString(first as Date)).toBe("2026-09-01");

    const second = parseDateInput("2026/9/1");
    expect(toShanghaiDateString(second as Date)).toBe("2026-09-01");

    const short = parseDateInput("9/1");
    expect(toShanghaiDateString(short as Date)).toBe(`${shanghaiYear()}-09-01`);
  });

  it("拒绝不存在的日期与乱码", () => {
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("昨天")).toBeNull();
  });
});

describe("normalizePlatform", () => {
  it("识别常见别名", () => {
    expect(normalizePlatform("小红书")).toBe("xiaohongshu");
    expect(normalizePlatform("B站")).toBe("bilibili");
    expect(normalizePlatform("抖音")).toBe("douyin");
    expect(normalizePlatform("微博")).toBeNull();
  });
});

describe("analyzeCsv", () => {
  const csv = [
    "标题,发布时间,播放,点赞",
    "作品 A,2026-09-01,1000,10",
    "作品 B,2026/9/2,2000,20",
    "作品 A,2026-09-01,3000,30",
    "作品 C,不是日期,400,40",
  ].join("\n");

  it("逐行校验并统计错误与疑似重复", () => {
    const preview = analyzeCsv(csv);

    expect(preview.summary).toEqual({ total: 4, valid: 3, invalid: 1, duplicate: 2 });
    expect(preview.missingRequired).toEqual([]);

    const invalid = preview.rows.find((row) => row.data === null);
    expect(invalid?.index).toBe(5);
    expect(invalid?.errors.join("；")).toContain("无法识别发布时间");

    const first = preview.rows[0];
    expect(first?.data?.views).toBe(1000);
    expect(first?.duplicate).toBe(true);
  });

  it("与已录入作品重复时也会标记", () => {
    const published = parseDateInput("2026-09-02") as Date;
    const existing = new Set([postDuplicateKey("作品 B", published)]);
    const preview = analyzeCsv(csv, undefined, existing);

    expect(preview.rows[1]?.duplicate).toBe(true);
    expect(preview.summary.duplicate).toBe(3);
  });

  it("手动传入的映射优先于自动识别", () => {
    const preview = analyzeCsv(csv, { "0": "title", "1": "publishedAt", "2": "likes" });
    expect(preview.rows[0]?.data?.likes).toBe(1000);
    expect(preview.rows[0]?.data?.views).toBeNull();
  });
});