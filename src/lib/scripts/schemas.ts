import { z } from "zod";

import {
  AI_PROGRESS_PHASES,
  SCRIPT_DURATION_MAX_SEC,
  SCRIPT_DURATION_MIN_SEC,
  SCRIPT_OUTLINE_MAX,
  SCRIPT_PAGE_SIZE_MAX,
  SCRIPT_TITLES_MAX,
} from "@/lib/constants";
import { quotaSnapshotSchema, sseErrorSchema } from "@/lib/topics/schemas";

/**
 * 脚本模块的共享契约：对外 DTO、请求入参、游标与 SSE 事件。
 * 服务端与客户端都从这里取类型与校验器，避免两端各写一份。
 */

// ---------- 对外 DTO ----------

export const scriptOutlineItemDtoSchema = z.object({
  section: z.string(),
  /** 该段预计时长（秒）；总时长由各段相加派生 */
  seconds: z.number().int(),
  content: z.string(),
  /** 画面 / 字幕提示，可为空 */
  visual: z.string(),
});

export type ScriptOutlineItemDto = z.infer<typeof scriptOutlineItemDtoSchema>;

export const scriptDtoSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  topicId: z.string().nullable(),
  /** 生成时的选题标题快照；手动创建时为 null */
  topicTitle: z.string().nullable(),
  titles: z.array(z.string()),
  /** titles[0] 的便捷别名，列表与卡片用 */
  title: z.string(),
  hook: z.string(),
  outline: z.array(scriptOutlineItemDtoSchema),
  tags: z.array(z.string()),
  coverCopy: z.string(),
  cta: z.string(),
  /** 由 outline 派生的完整口播稿，不落库 */
  fullScript: z.string(),
  totalSeconds: z.number().int(),
  platform: z.string(),
  source: z.string(),
  model: z.string().nullable(),
  isFavorite: z.boolean(),
  isDiscarded: z.boolean(),
  editedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ScriptDto = z.infer<typeof scriptDtoSchema>;

// ---------- 配额用量 ----------

/** 生成接口随 SSE 返回的用量：本月脚本额度 + 全局日额度。 */
export const scriptUsageSchema = z.object({
  script: quotaSnapshotSchema,
  aiDaily: quotaSnapshotSchema,
});

export type ScriptUsage = z.infer<typeof scriptUsageSchema>;

// ---------- 请求入参 ----------

export const generateScriptSchema = z
  .object({
    topicId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1, "标题不能为空").max(60, "标题最多 60 字").optional(),
    extraNote: z.string().trim().max(200, "补充说明最多 200 字").optional(),
    durationSec: z
      .number()
      .int("时长必须是整数秒")
      .min(SCRIPT_DURATION_MIN_SEC, `时长不能少于 ${SCRIPT_DURATION_MIN_SEC} 秒`)
      .max(SCRIPT_DURATION_MAX_SEC, `时长不能超过 ${SCRIPT_DURATION_MAX_SEC} 秒`)
      .optional(),
  })
  .strict()
  .refine((value) => value.topicId !== undefined || value.title !== undefined, {
    message: "topicId 与 title 至少提供一个",
  });

export type GenerateScriptInput = z.infer<typeof generateScriptSchema>;

const outlineSaveItemSchema = z.object({
  section: z.string().trim().max(40, "段落标题最多 40 字").optional(),
  seconds: z.number().int().min(0).max(900).optional(),
  content: z.string().trim().max(800, "单段口播最多 800 字").optional(),
  visual: z.string().trim().max(300, "画面提示最多 300 字").optional(),
});

/** 人工保存（AI 校验两次失败后的草稿，或用户手动新增）。不消耗配额。 */
export const saveScriptSchema = z
  .object({
    topicId: z.string().trim().min(1).optional(),
    batchId: z.string().trim().min(1).optional(),
    durationSec: z
      .number()
      .int()
      .min(SCRIPT_DURATION_MIN_SEC)
      .max(SCRIPT_DURATION_MAX_SEC)
      .optional(),
    titles: z
      .array(z.string().trim().min(1, "标题不能为空").max(40, "标题最多 40 字"))
      .min(1, "至少保留 1 个标题候选")
      .max(SCRIPT_TITLES_MAX, `最多 ${SCRIPT_TITLES_MAX} 个标题候选`),
    hook: z.string().trim().max(200, "开头钩子最多 200 字").optional(),
    outline: z.array(outlineSaveItemSchema).max(SCRIPT_OUTLINE_MAX).optional(),
    tags: z.array(z.string().trim().min(1).max(24)).max(10, "标签最多 10 个").optional(),
    coverCopy: z.string().trim().max(40, "封面文案最多 40 字").optional(),
    cta: z.string().trim().max(120, "结尾引导最多 120 字").optional(),
  })
  .strict();

export type SaveScriptInput = z.infer<typeof saveScriptSchema>;

export const updateScriptSchema = z
  .object({
    titles: z
      .array(z.string().trim().min(1, "标题不能为空").max(40, "标题最多 40 字"))
      .min(1, "至少保留 1 个标题候选")
      .max(SCRIPT_TITLES_MAX)
      .optional(),
    hook: z.string().trim().max(200, "开头钩子最多 200 字").optional(),
    outline: z.array(outlineSaveItemSchema).max(SCRIPT_OUTLINE_MAX).optional(),
    tags: z.array(z.string().trim().min(1).max(24)).max(10).optional(),
    coverCopy: z.string().trim().max(40, "封面文案最多 40 字").optional(),
    cta: z.string().trim().max(120, "结尾引导最多 120 字").optional(),
    isFavorite: z.boolean().optional(),
    isDiscarded: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "至少提供一个要更新的字段",
  });

export type UpdateScriptInput = z.infer<typeof updateScriptSchema>;

export const listScriptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(SCRIPT_PAGE_SIZE_MAX).optional(),
  cursor: z.string().trim().min(1).optional(),
  topicId: z.string().trim().min(1).optional(),
  favorite: z.enum(["1", "0"]).optional(),
  includeDiscarded: z.enum(["1", "0"]).optional(),
});

// ---------- 游标 ----------
// 形式：encodeURIComponent("<createdAt ISO>|<id>")，对客户端不透明。

export function encodeScriptCursor(createdAt: Date | string, id: string): string {
  const iso = typeof createdAt === "string" ? createdAt : createdAt.toISOString();
  return encodeURIComponent(`${iso}|${id}`);
}

export function decodeScriptCursor(cursor: string): { createdAt: Date; id: string } | null {
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

export const sseScriptMetaSchema = z.object({
  batchId: z.string(),
  model: z.string(),
  topicId: z.string().nullable(),
  durationSec: z.number().int(),
  usage: scriptUsageSchema,
});

export const sseScriptProgressSchema = z.object({
  phase: z.enum(AI_PROGRESS_PHASES),
  /** 已接收字符数：只暴露进度，不透传模型原文 */
  chars: z.number().int(),
  attempt: z.number().int(),
});

export const sseScriptSchema = z.object({
  script: scriptDtoSchema,
});

export const sseScriptDoneSchema = z.object({
  batchId: z.string(),
  scriptId: z.string(),
  latencyMs: z.number().int(),
  usage: scriptUsageSchema,
});

export { sseErrorSchema };

export const sseScriptEventSchemas = {
  meta: sseScriptMetaSchema,
  progress: sseScriptProgressSchema,
  script: sseScriptSchema,
  done: sseScriptDoneSchema,
  error: sseErrorSchema,
} as const;

export type SseScriptMeta = z.infer<typeof sseScriptMetaSchema>;
export type SseScriptProgress = z.infer<typeof sseScriptProgressSchema>;
export type SseScriptEvent = z.infer<typeof sseScriptSchema>;
export type SseScriptDone = z.infer<typeof sseScriptDoneSchema>;
export type SseScriptError = z.infer<typeof sseErrorSchema>;