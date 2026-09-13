import { z } from "zod";

import { topicDraftItemSchema } from "@/lib/ai/schemas/topic";
import {
  AI_PROGRESS_PHASES,
  TOPIC_BATCH_SIZE,
  TOPIC_EXCLUDE_TITLES_MAX,
  TOPIC_PAGE_SIZE_MAX,
} from "@/lib/constants";

/**
 * 选题模块的共享契约：对外 DTO、请求入参、游标与 SSE 事件。
 * 服务端与客户端都从这里取类型与校验器，避免两端各写一份。
 */

// ---------- 对外 DTO ----------

export const topicDtoSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  title: z.string(),
  angle: z.string(),
  reason: z.string(),
  referenceDirection: z.string(),
  keywords: z.array(z.string()),
  score: z.number().int(),
  difficulty: z.string(),
  source: z.string(),
  isFavorite: z.boolean(),
  isDiscarded: z.boolean(),
  createdAt: z.string(),
});

export type TopicDto = z.infer<typeof topicDtoSchema>;

// ---------- 配额用量 ----------

export const quotaSnapshotSchema = z.object({
  kind: z.string(),
  period: z.string(),
  used: z.number().int(),
  limit: z.number().int(),
});

export type QuotaSnapshot = z.infer<typeof quotaSnapshotSchema>;

/** 生成接口随 SSE 返回的用量信息。 */
export const topicUsageSchema = z.object({
  topic: quotaSnapshotSchema,
  aiDaily: quotaSnapshotSchema,
});

export type TopicUsage = z.infer<typeof topicUsageSchema>;

export const usageSummarySchema = z.object({
  month: z.object({
    period: z.string(),
    topic: quotaSnapshotSchema,
    script: quotaSnapshotSchema,
    review: quotaSnapshotSchema,
  }),
  day: z.object({
    period: z.string(),
    aiDaily: quotaSnapshotSchema,
  }),
});

export type UsageSummary = z.infer<typeof usageSummarySchema>;

// ---------- 请求入参 ----------

export const generateTopicsSchema = z
  .object({
    profileId: z.string().trim().min(1).optional(),
    extraNote: z.string().trim().max(200, "补充说明最多 200 字").optional(),
    excludeTitles: z
      .array(z.string().trim().min(1).max(60))
      .max(TOPIC_EXCLUDE_TITLES_MAX, `最多携带 ${TOPIC_EXCLUDE_TITLES_MAX} 条历史标题`)
      .optional(),
  })
  .strict();

export type GenerateTopicsInput = z.infer<typeof generateTopicsSchema>;

/** 人工保存（AI 校验两次失败后的草稿，或用户手动新增）。不消耗配额。 */
export const saveTopicsSchema = z
  .object({
    batchId: z.string().trim().min(1).optional(),
    items: z
      .array(
        z.object({
          title: z.string().trim().min(1, "标题不能为空").max(40, "标题最多 40 字"),
          angle: z.string().trim().max(80, "切入角度最多 80 字").optional(),
          reason: z.string().trim().max(400, "推荐理由最多 400 字").optional(),
          referenceDirection: z.string().trim().max(400, "参考方向最多 400 字").optional(),
          keywords: z.array(z.string().trim().min(1).max(24)).max(6).optional(),
          score: z.number().int().min(0).max(100).nullable().optional(),
          difficulty: z.string().trim().max(16).optional(),
        }),
      )
      .min(1, "至少保存 1 条")
      .max(TOPIC_BATCH_SIZE, `一次最多保存 ${TOPIC_BATCH_SIZE} 条`),
  })
  .strict();

export type SaveTopicsInput = z.infer<typeof saveTopicsSchema>;

export const draftItemToSaveInput = (item: z.infer<typeof topicDraftItemSchema>) => ({
  title: item.title,
  angle: item.angle,
  reason: item.reason,
  referenceDirection: item.referenceDirection,
  keywords: item.keywords,
  score: item.score,
  difficulty: item.difficulty,
});

export const listTopicsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(TOPIC_PAGE_SIZE_MAX).optional(),
  cursor: z.string().trim().min(1).optional(),
  favorite: z.enum(["1", "0"]).optional(),
  includeDiscarded: z.enum(["1", "0"]).optional(),
});

export const updateTopicSchema = z
  .object({
    isFavorite: z.boolean().optional(),
    isDiscarded: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.isFavorite !== undefined || value.isDiscarded !== undefined, {
    message: "至少提供一个要更新的字段",
  });

// ---------- 游标 ----------
// 形式：encodeURIComponent("<createdAt ISO>|<id>")，对客户端不透明。

export function encodeTopicCursor(createdAt: Date | string, id: string): string {
  const iso = typeof createdAt === "string" ? createdAt : createdAt.toISOString();
  return encodeURIComponent(`${iso}|${id}`);
}

export function decodeTopicCursor(cursor: string): { createdAt: Date; id: string } | null {
  let raw: string;
  try {
    raw = decodeURIComponent(cursor);
  } catch {
    return null;
  }

  const separator = raw.lastIndexOf("|");
  if (separator <= 0) {
    return null;
  }

  const iso = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  const createdAt = new Date(iso);

  if (Number.isNaN(createdAt.getTime()) || iso.length === 0 || id.length === 0) {
    return null;
  }

  return { createdAt, id };
}

// ---------- SSE 事件 ----------

export const SSE_EVENTS = {
  meta: "meta",
  progress: "progress",
  topic: "topic",
  script: "script",
  review: "review",
  done: "done",
  error: "error",
} as const;

export type SseEventName = (typeof SSE_EVENTS)[keyof typeof SSE_EVENTS];

/** 阶段枚举的唯一真源在 constants，这里保留旧名字以兼容已有引用。 */
export const TOPIC_PROGRESS_PHASES = AI_PROGRESS_PHASES;

export const sseMetaSchema = z.object({
  batchId: z.string(),
  model: z.string(),
  count: z.number().int(),
  usage: topicUsageSchema,
});

export const sseProgressSchema = z.object({
  phase: z.enum(AI_PROGRESS_PHASES),
  /** 已接收字符数：只暴露进度，不透传模型原文 */
  chars: z.number().int(),
  attempt: z.number().int(),
});

export const sseTopicSchema = z.object({
  index: z.number().int(),
  topic: topicDtoSchema,
});

export const sseDoneSchema = z.object({
  batchId: z.string(),
  created: z.number().int(),
  latencyMs: z.number().int(),
  usage: topicUsageSchema,
});

export const sseErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const sseEventSchemas = {
  meta: sseMetaSchema,
  progress: sseProgressSchema,
  topic: sseTopicSchema,
  done: sseDoneSchema,
  error: sseErrorSchema,
} as const;

export type SseMeta = z.infer<typeof sseMetaSchema>;
export type SseProgress = z.infer<typeof sseProgressSchema>;
export type SseTopic = z.infer<typeof sseTopicSchema>;
export type SseDone = z.infer<typeof sseDoneSchema>;
export type SseError = z.infer<typeof sseErrorSchema>;
