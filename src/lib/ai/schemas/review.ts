import { z } from "zod";

import {
  REVIEW_DIAGNOSTICS_MAX,
  REVIEW_DIAGNOSTICS_MIN,
  REVIEW_NEXT_TOPICS_COUNT,
  REVIEW_POINTS_MAX,
  REVIEW_POINTS_MIN,
  REVIEW_SUGGESTIONS_MAX,
  REVIEW_SUGGESTIONS_MIN,
} from "@/lib/constants";

import { safeExtractJsonValue } from "../json";
import { draftArray, draftStringArray, draftText } from "./draft";

/**
 * 复盘相关的 Zod 契约（AI 输出 + 降级草稿）。
 * 不依赖服务端专有 API，客户端可复用其中的类型。
 */

/** 诊断维度固定枚举：约束模型只在口径内分析，避免出现无法归类的维度。 */
export const REVIEW_DIMENSIONS = ["选题", "标题", "开头", "节奏", "互动引导", "发布节奏"] as const;

export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

export const reviewDiagnosticSchema = z.object({
  dimension: z.enum(REVIEW_DIMENSIONS, {
    errorMap: () => ({ message: `维度必须是：${REVIEW_DIMENSIONS.join(" / ")}` }),
  }),
  verdict: z.string().trim().min(1, "缺少结论").max(80, "结论最多 80 字"),
  evidence: z.string().trim().min(1, "缺少数据依据").max(120, "数据依据最多 120 字"),
  suggestion: z.string().trim().min(1, "缺少改进建议").max(120, "改进建议最多 120 字"),
});

export type ReviewDiagnostic = z.infer<typeof reviewDiagnosticSchema>;

export const reviewNextTopicSchema = z.object({
  title: z.string().trim().min(1, "选题标题不能为空").max(40, "选题标题最多 40 字"),
  reason: z.string().trim().min(1, "缺少推荐理由").max(120, "推荐理由最多 120 字"),
});

export type ReviewNextTopic = z.infer<typeof reviewNextTopicSchema>;

/** 模型必须返回的结构。任何一条不满足都会触发「修复重试」，二次失败则降级。 */
export const reviewOutputSchema = z.object({
  summary: z.string().trim().min(1, "缺少结论摘要").max(300, "结论摘要最多 300 字"),
  diagnostics: z
    .array(reviewDiagnosticSchema)
    .min(REVIEW_DIAGNOSTICS_MIN, `分维度诊断至少 ${REVIEW_DIAGNOSTICS_MIN} 条`)
    .max(REVIEW_DIAGNOSTICS_MAX, `分维度诊断最多 ${REVIEW_DIAGNOSTICS_MAX} 条`),
  highlights: z
    .array(z.string().trim().min(1).max(100, "单条亮点最多 100 字"))
    .min(REVIEW_POINTS_MIN, `亮点至少 ${REVIEW_POINTS_MIN} 条`)
    .max(REVIEW_POINTS_MAX, `亮点最多 ${REVIEW_POINTS_MAX} 条`),
  problems: z
    .array(z.string().trim().min(1).max(100, "单条问题最多 100 字"))
    .min(REVIEW_POINTS_MIN, `问题至少 ${REVIEW_POINTS_MIN} 条`)
    .max(REVIEW_POINTS_MAX, `问题最多 ${REVIEW_POINTS_MAX} 条`),
  suggestions: z
    .array(z.string().trim().min(1).max(120, "单条建议最多 120 字"))
    .min(REVIEW_SUGGESTIONS_MIN, `下一步建议至少 ${REVIEW_SUGGESTIONS_MIN} 条`)
    .max(REVIEW_SUGGESTIONS_MAX, `下一步建议最多 ${REVIEW_SUGGESTIONS_MAX} 条`),
  nextTopics: z
    .array(reviewNextTopicSchema)
    .length(REVIEW_NEXT_TOPICS_COUNT, `下一批选题必须给 ${REVIEW_NEXT_TOPICS_COUNT} 条`),
  baselineNote: z.string().trim().min(1, "缺少基线口径说明").max(120, "基线说明最多 120 字"),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

// ---------- 降级草稿（结构与正式输出一致，但字段宽松） ----------

export const reviewDiagnosticDraftSchema = z.object({
  dimension: draftText(16),
  verdict: draftText(80),
  evidence: draftText(120),
  suggestion: draftText(120),
});

export const reviewNextTopicDraftSchema = z.object({
  title: draftText(60),
  reason: draftText(160),
});

export const reviewDraftSchema = z.object({
  summary: draftText(400),
  diagnostics: draftArray(reviewDiagnosticDraftSchema, REVIEW_DIAGNOSTICS_MAX),
  highlights: draftStringArray(100, REVIEW_POINTS_MAX),
  problems: draftStringArray(100, REVIEW_POINTS_MAX),
  suggestions: draftStringArray(160, REVIEW_SUGGESTIONS_MAX),
  nextTopics: draftArray(reviewNextTopicDraftSchema, REVIEW_NEXT_TOPICS_COUNT),
  baselineNote: draftText(160),
});

export type ReviewDraft = z.infer<typeof reviewDraftSchema>;
export type ReviewDiagnosticDraft = z.infer<typeof reviewDiagnosticDraftSchema>;
export type ReviewNextTopicDraft = z.infer<typeof reviewNextTopicDraftSchema>;
function emptyDiagnostic(): ReviewDiagnosticDraft {
  return { dimension: "", verdict: "", evidence: "", suggestion: "" };
}

function emptyNextTopic(): ReviewNextTopicDraft {
  return { title: "", reason: "" };
}

/** 完全空白但可直接编辑的草稿；保留一条诊断与一条选题行，避免用户对着空表单发懵。 */
export function emptyReviewDraft(): ReviewDraft {
  return {
    summary: "",
    diagnostics: [emptyDiagnostic()],
    highlights: [],
    problems: [],
    suggestions: [],
    nextTopics: [emptyNextTopic()],
    baselineNote: "",
  };
}

/** 从模型原文里挑出最可能代表「一份复盘」的那个对象。 */
function pickReviewCandidate(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return record["review"] ?? record["report"] ?? record["data"] ?? value;
  }

  return null;
}

/**
 * 尽最大努力把模型原文转成可编辑草稿：
 * 能解析出多少就保留多少，缺失字段降级为空值，保证前端永远拿到固定结构。
 */
export function buildReviewDraft(rawText: string): ReviewDraft {
  const parsed = reviewDraftSchema.safeParse(pickReviewCandidate(safeExtractJsonValue(rawText)));
  const draft: ReviewDraft = parsed.success ? parsed.data : emptyReviewDraft();

  if (draft.diagnostics.length === 0) {
    draft.diagnostics = [emptyDiagnostic()];
  }

  if (draft.nextTopics.length === 0) {
    draft.nextTopics = [emptyNextTopic()];
  }

  return draft;
}