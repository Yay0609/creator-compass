import { z } from "zod";

import { baselineSchema, decodeCursor, encodeCursor } from "@/lib/posts/schemas";
import { quotaSnapshotSchema, sseErrorSchema } from "@/lib/topics/schemas";
import {
  AI_PROGRESS_PHASES,
  REVIEW_DIAGNOSTICS_MAX,
  REVIEW_NEXT_TOPICS_COUNT,
  REVIEW_PAGE_SIZE_MAX,
  REVIEW_POINTS_MAX,
  REVIEW_POST_MAX,
  REVIEW_POST_MIN,
  REVIEW_SUGGESTIONS_MAX,
} from "@/lib/constants";

/**
 * 复盘模块的共享契约：对外 DTO、请求入参、游标与 SSE 事件。
 * 服务端与客户端都从这里取类型与校验器，避免两端各写一份。
 */

// ---------- 对外 DTO ----------

export const reviewDiagnosticDtoSchema = z.object({
  dimension: z.string(),
  verdict: z.string(),
  evidence: z.string(),
  suggestion: z.string(),
});

export type ReviewDiagnosticDto = z.infer<typeof reviewDiagnosticDtoSchema>;

export const reviewNextTopicDtoSchema = z.object({
  title: z.string(),
  reason: z.string(),
});

export type ReviewNextTopicDto = z.infer<typeof reviewNextTopicDtoSchema>;

/** 报告里冻结的逐条作品数据（来自生成时的快照，作品被修改 / 删除都不会变）。 */
export const reviewPostSnapshotDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  publishedAt: z.string(),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  saves: z.number().nullable(),
  followsGained: z.number().nullable(),
  completionRate: z.number().nullable(),
  interactionRate: z.number().nullable(),
});

export type ReviewPostSnapshotDto = z.infer<typeof reviewPostSnapshotDtoSchema>;

export const reviewDtoSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  scope: z.string(),
  postIds: z.array(z.string()),
  /** 生成时纳入的作品标题快照（只读），作品被删除后依然可读 */
  postTitles: z.array(z.string()),
  /** 生成时纳入的作品明细快照（只读），报告图表与表格用 */
  posts: z.array(reviewPostSnapshotDtoSchema),
  sampleSize: z.number().int(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  summary: z.string(),
  diagnostics: z.array(reviewDiagnosticDtoSchema),
  highlights: z.array(z.string()),
  problems: z.array(z.string()),
  suggestions: z.array(z.string()),
  nextTopics: z.array(reviewNextTopicDtoSchema),
  baselineNote: z.string(),
  /** 生成时的账号基线快照（只读） */
  baseline: baselineSchema,
  model: z.string().nullable(),
  source: z.string(),
  isFavorite: z.boolean(),
  isDiscarded: z.boolean(),
  editedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ReviewDto = z.infer<typeof reviewDtoSchema>;

// ---------- 配额用量 ----------

/** 生成接口随 SSE 返回的用量：本月复盘额度 + 全局日额度。 */
export const reviewUsageSchema = z.object({
  review: quotaSnapshotSchema,
  aiDaily: quotaSnapshotSchema,
});

export type ReviewUsage = z.infer<typeof reviewUsageSchema>;

// ---------- 请求入参 ----------

export const generateReviewSchema = z
  .object({
    postIds: z
      .array(z.string().trim().min(1))
      .min(REVIEW_POST_MIN, "至少选择 1 条作品")
      .max(REVIEW_POST_MAX, `一次最多复盘 ${REVIEW_POST_MAX} 条作品`),
    focus: z.string().trim().max(200, "补充说明最多 200 字").optional(),
  })
  .strict();

export type GenerateReviewInput = z.infer<typeof generateReviewSchema>;

const diagnosticEditSchema = z.object({
  dimension: z.string().trim().max(16).optional(),
  verdict: z.string().trim().max(120).optional(),
  evidence: z.string().trim().max(160).optional(),
  suggestion: z.string().trim().max(160).optional(),
});

const nextTopicEditSchema = z.object({
  title: z.string().trim().max(60).optional(),
  reason: z.string().trim().max(160).optional(),
});

/** 报告可编辑：降级草稿补全后需要能落库，用户也可以直接改 AI 的结论。 */
export const updateReviewSchema = z
  .object({
    summary: z.string().trim().max(400).optional(),
    diagnostics: z.array(diagnosticEditSchema).max(REVIEW_DIAGNOSTICS_MAX).optional(),
    highlights: z.array(z.string().trim().max(140)).max(REVIEW_POINTS_MAX).optional(),
    problems: z.array(z.string().trim().max(140)).max(REVIEW_POINTS_MAX).optional(),
    suggestions: z.array(z.string().trim().max(180)).max(REVIEW_SUGGESTIONS_MAX).optional(),
    nextTopics: z.array(nextTopicEditSchema).max(REVIEW_NEXT_TOPICS_COUNT).optional(),
    baselineNote: z.string().trim().max(160).optional(),
    isFavorite: z.boolean().optional(),
    isDiscarded: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "至少提供一个要更新的字段",
  });

export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

/**
 * 人工保存（AI 二次校验失败后的「可编辑草稿」，或用户手动新建）。
 * 不调用 AI、不消耗配额，因此草稿补全后仍能落库。
 */
export const saveReviewSchema = z
  .object({
    batchId: z.string().trim().min(1).optional(),
    postIds: z.array(z.string().trim().min(1)).max(REVIEW_POST_MAX).optional(),
    summary: z.string().trim().max(400).optional(),
    diagnostics: z.array(diagnosticEditSchema).max(REVIEW_DIAGNOSTICS_MAX).optional(),
    highlights: z.array(z.string().trim().max(140)).max(REVIEW_POINTS_MAX).optional(),
    problems: z.array(z.string().trim().max(140)).max(REVIEW_POINTS_MAX).optional(),
    suggestions: z.array(z.string().trim().max(180)).max(REVIEW_SUGGESTIONS_MAX).optional(),
    nextTopics: z.array(nextTopicEditSchema).max(REVIEW_NEXT_TOPICS_COUNT).optional(),
    baselineNote: z.string().trim().max(160).optional(),
  })
  .strict();

export type SaveReviewInput = z.infer<typeof saveReviewSchema>;

export const listReviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(REVIEW_PAGE_SIZE_MAX).optional(),
  cursor: z.string().trim().min(1).optional(),
  favorite: z.enum(["1", "0"]).optional(),
  includeDiscarded: z.enum(["1", "0"]).optional(),
});

// ---------- 游标 ----------
// 与作品列表共用同一套编解码（posts/schemas.ts），对客户端不透明。

export function encodeReviewCursor(createdAt: Date | string, id: string): string {
  return encodeCursor(createdAt, id);
}

export function decodeReviewCursor(cursor: string): { createdAt: Date; id: string } | null {
  return decodeCursor(cursor);
}

// ---------- SSE 事件 ----------

export const sseReviewMetaSchema = z.object({
  batchId: z.string(),
  model: z.string(),
  postCount: z.number().int(),
  sampleSize: z.number().int(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  usage: reviewUsageSchema,
});

export const sseReviewProgressSchema = z.object({
  phase: z.enum(AI_PROGRESS_PHASES),
  /** 已接收字符数：只暴露进度，不透传模型原文 */
  chars: z.number().int(),
  attempt: z.number().int(),
});

export const sseReviewSchema = z.object({
  review: reviewDtoSchema,
});

export const sseReviewDoneSchema = z.object({
  batchId: z.string(),
  reviewId: z.string(),
  latencyMs: z.number().int(),
  usage: reviewUsageSchema,
});

export { sseErrorSchema };

export const sseReviewEventSchemas = {
  meta: sseReviewMetaSchema,
  progress: sseReviewProgressSchema,
  review: sseReviewSchema,
  done: sseReviewDoneSchema,
  error: sseErrorSchema,
} as const;

export type SseReviewMeta = z.infer<typeof sseReviewMetaSchema>;
export type SseReviewProgress = z.infer<typeof sseReviewProgressSchema>;
export type SseReviewEvent = z.infer<typeof sseReviewSchema>;
export type SseReviewDone = z.infer<typeof sseReviewDoneSchema>;
export type SseReviewError = z.infer<typeof sseErrorSchema>;