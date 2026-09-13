import { z } from "zod";

import { TOPIC_BATCH_SIZE } from "@/lib/constants";

import { safeExtractJsonValue } from "../json";

/**
 * 选题相关的 Zod 契约（AI 输出 + 降级草稿）。
 * 本模块不依赖服务端专有 API，客户端也可复用其中的类型。
 */

export const TOPIC_DIFFICULTIES = ["low", "medium", "high"] as const;

/** 模型必须返回的结构。任何一条不满足都会触发「修复重试」，二次失败则降级。 */
export const topicItemSchema = z.object({
  title: z.string().trim().min(1, "缺少标题").max(40, "标题最多 40 字"),
  angle: z.string().trim().min(1, "缺少切入角度").max(80, "切入角度最多 80 字"),
  reason: z.string().trim().min(1, "缺少推荐理由").max(400, "推荐理由最多 400 字"),
  referenceDirection: z.string().trim().min(1, "缺少参考方向").max(400, "参考方向最多 400 字"),
  keywords: z
    .array(z.string().trim().min(1).max(24))
    .min(3, "关键词至少 3 个")
    .max(6, "关键词最多 6 个"),
  score: z.number().int("评分必须是整数").min(0, "评分不能小于 0").max(100, "评分不能大于 100"),
  difficulty: z.enum(TOPIC_DIFFICULTIES, {
    errorMap: () => ({ message: "难度只能是 low/medium/high" }),
  }),
});

export type TopicItem = z.infer<typeof topicItemSchema>;

export const topicListSchema = z.object({
  items: z.array(topicItemSchema).length(TOPIC_BATCH_SIZE, `必须恰好 ${TOPIC_BATCH_SIZE} 条选题`),
});

export type TopicList = z.infer<typeof topicListSchema>;

/** 把 Zod 错误压成「字段: 原因」的可读列表，用于修复提示词与日志。 */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".") || "(root)";
    return `${path}: ${issue.message}`;
  });
}

// ---------- 降级草稿 ----------
// 二次校验失败时给用户一份「可编辑草稿」：字段尽量保留模型给到的内容，
// 缺失或不合法的一律降级为空值，由用户补全后再保存。

const draftText = (max: number) =>
  z.preprocess((value) => {
    if (typeof value === "string") {
      return value.trim().slice(0, max);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return "";
  }, z.string());

const draftKeywords = z.preprocess((value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim().slice(0, 24);
      }
      if (typeof item === "number") {
        return String(item);
      }
      return "";
    })
    .filter((item) => item.length > 0)
    .slice(0, 6);
}, z.array(z.string()));

const draftScore = z.preprocess((value) => {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(numeric)));
}, z.number().int().nullable());

export const topicDraftItemSchema = z.object({
  title: draftText(60),
  angle: draftText(120),
  reason: draftText(500),
  referenceDirection: draftText(500),
  keywords: draftKeywords,
  score: draftScore,
  difficulty: draftText(16),
});

export type TopicDraftItem = z.infer<typeof topicDraftItemSchema>;

export function emptyDraftItem(): TopicDraftItem {
  return {
    title: "",
    angle: "",
    reason: "",
    referenceDirection: "",
    keywords: [],
    score: null,
    difficulty: "",
  };
}

function pickCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nested = record["items"] ?? record["topics"] ?? record["data"];
    if (Array.isArray(nested)) {
      return nested;
    }
    return [value];
  }

  return [];
}

/**
 * 尽最大努力把模型原文转成 5 条可编辑草稿：
 * 能解析出几条就保留几条，其余用空草稿补齐，保证前端永远拿到固定长度。
 */
export function buildTopicDraft(rawText: string): TopicDraftItem[] {
  const candidates = pickCandidates(safeExtractJsonValue(rawText));
  const items: TopicDraftItem[] = [];

  for (const candidate of candidates) {
    const parsed = topicDraftItemSchema.safeParse(candidate);
    if (!parsed.success) {
      continue;
    }
    items.push(parsed.data);
    if (items.length >= TOPIC_BATCH_SIZE) {
      break;
    }
  }

  while (items.length < TOPIC_BATCH_SIZE) {
    items.push(emptyDraftItem());
  }

  return items;
}
