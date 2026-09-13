import { describe, expect, it } from "vitest";

import { buildTopicDraft, topicItemSchema, topicListSchema } from "@/lib/ai/schemas/topic";
import { TOPIC_BATCH_SIZE, TOPIC_EXCLUDE_TITLES_MAX } from "@/lib/constants";
import {
  decodeTopicCursor,
  encodeTopicCursor,
  generateTopicsSchema,
  saveTopicsSchema,
  updateTopicSchema,
} from "@/lib/topics/schemas";

function validItem(index: number) {
  return {
    title: `选题 ${index}`,
    angle: "从常见误区切入",
    reason: "与画像匹配",
    referenceDirection: "先结论后步骤",
    keywords: ["a", "b", "c"],
    score: 80,
    difficulty: "medium",
  };
}

describe("选题 AI 输出契约", () => {
  it("恰好 5 条合法选题通过校验", () => {
    const items = Array.from({ length: TOPIC_BATCH_SIZE }, (_, index) => validItem(index));
    expect(topicListSchema.safeParse({ items }).success).toBe(true);
  });

  it("条数不符时校验失败", () => {
    const result = topicListSchema.safeParse({ items: [validItem(0)] });
    expect(result.success).toBe(false);
  });

  it("关键词少于 3 个时校验失败", () => {
    const result = topicItemSchema.safeParse({ ...validItem(0), keywords: ["a", "b"] });
    expect(result.success).toBe(false);
  });

  it("评分越界时校验失败", () => {
    expect(topicItemSchema.safeParse({ ...validItem(0), score: 101 }).success).toBe(false);
    expect(topicItemSchema.safeParse({ ...validItem(0), score: 80.5 }).success).toBe(false);
  });

  it("难度只接受 low/medium/high", () => {
    expect(topicItemSchema.safeParse({ ...validItem(0), difficulty: "easy" }).success).toBe(false);
  });
});

describe("降级草稿", () => {
  it("无法解析时补齐为固定 5 条空草稿", () => {
    const draft = buildTopicDraft("完全不是 JSON");
    expect(draft).toHaveLength(TOPIC_BATCH_SIZE);
    expect(draft.every((item) => item.title === "" && item.score === null)).toBe(true);
  });

  it("保留模型给到的内容，并把越界评分钳制到 0–100", () => {
    const draft = buildTopicDraft(
      JSON.stringify({ items: [{ title: "只有标题", score: 999, keywords: ["one"] }] }),
    );
    expect(draft).toHaveLength(TOPIC_BATCH_SIZE);
    expect(draft[0]?.title).toBe("只有标题");
    expect(draft[0]?.score).toBe(100);
    expect(draft[0]?.keywords).toEqual(["one"]);
  });
});

describe("选题接口入参契约", () => {
  it("excludeTitles 超过上限被拒绝", () => {
    const titles = Array.from(
      { length: TOPIC_EXCLUDE_TITLES_MAX + 1 },
      (_, index) => `标题 ${index}`,
    );
    expect(generateTopicsSchema.safeParse({ excludeTitles: titles }).success).toBe(false);
  });

  it("未知字段被拒绝（strict）", () => {
    expect(generateTopicsSchema.safeParse({ unexpected: true }).success).toBe(false);
  });

  it("补充说明超过 200 字被拒绝", () => {
    expect(generateTopicsSchema.safeParse({ extraNote: "字".repeat(201) }).success).toBe(false);
  });

  it("保存草稿要求标题非空", () => {
    expect(saveTopicsSchema.safeParse({ items: [{ title: "  " }] }).success).toBe(false);
    expect(saveTopicsSchema.safeParse({ items: [{ title: "可以保存" }] }).success).toBe(true);
  });

  it("收藏更新至少要有一个字段", () => {
    expect(updateTopicSchema.safeParse({}).success).toBe(false);
    expect(updateTopicSchema.safeParse({ isFavorite: true }).success).toBe(true);
  });
});

describe("历史分页游标", () => {
  it("编码后可无损解码", () => {
    const createdAt = new Date("2026-09-13T04:05:06.000Z");
    const cursor = encodeTopicCursor(createdAt, "clx123");
    const decoded = decodeTopicCursor(cursor);
    expect(decoded?.id).toBe("clx123");
    expect(decoded?.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it("非法游标返回 null", () => {
    expect(decodeTopicCursor("garbage")).toBeNull();
    expect(decodeTopicCursor(encodeURIComponent("not-a-date|id"))).toBeNull();
  });
});
