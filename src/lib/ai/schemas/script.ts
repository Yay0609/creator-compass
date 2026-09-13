import { z } from "zod";

import {
  SCRIPT_OUTLINE_MAX,
  SCRIPT_OUTLINE_MIN,
  SCRIPT_TITLES_MAX,
  SCRIPT_TITLES_MIN,
} from "@/lib/constants";

import { safeExtractJsonValue } from "../json";
import { draftArray, draftNumber, draftStringArray, draftText } from "./draft";

/**
 * 脚本相关的 Zod 契约（AI 输出 + 降级草稿）。
 * 本模块不依赖服务端专有 API，客户端也可复用其中的类型。
 */

/** 分段脚本的单段结构（AI 输出必须满足）。 */
export const scriptOutlineItemSchema = z.object({
  section: z.string().trim().min(1, "缺少段落标题").max(40, "段落标题最多 40 字"),
  seconds: z.number().int("时长必须是整数秒").min(3, "单段至少 3 秒").max(300, "单段最多 300 秒"),
  content: z.string().trim().min(1, "缺少口播内容").max(800, "单段口播最多 800 字"),
  visual: z.string().trim().max(300, "画面提示最多 300 字").optional(),
});

export type ScriptOutlineItem = z.infer<typeof scriptOutlineItemSchema>;

/** 模型必须返回的结构。任何一条不满足都会触发「修复重试」，二次失败则降级。 */
export const scriptOutputSchema = z.object({
  titles: z
    .array(z.string().trim().min(1, "标题不能为空").max(40, "标题最多 40 字"))
    .min(SCRIPT_TITLES_MIN, `标题候选至少 ${SCRIPT_TITLES_MIN} 个`)
    .max(SCRIPT_TITLES_MAX, `标题候选最多 ${SCRIPT_TITLES_MAX} 个`),
  hook: z.string().trim().min(1, "缺少开头钩子").max(200, "开头钩子最多 200 字"),
  outline: z
    .array(scriptOutlineItemSchema)
    .min(SCRIPT_OUTLINE_MIN, `分段脚本至少 ${SCRIPT_OUTLINE_MIN} 段`)
    .max(SCRIPT_OUTLINE_MAX, `分段脚本最多 ${SCRIPT_OUTLINE_MAX} 段`),
  tags: z
    .array(z.string().trim().min(1).max(24))
    .min(3, "标签至少 3 个")
    .max(10, "标签最多 10 个"),
  coverCopy: z.string().trim().min(1, "缺少封面文案").max(40, "封面文案最多 40 字"),
  cta: z.string().trim().max(120, "结尾引导最多 120 字").optional(),
});

export type ScriptOutput = z.infer<typeof scriptOutputSchema>;

// ---------- 降级草稿（结构与正式输出一致，但字段宽松、全可选） ----------

export const scriptDraftOutlineItemSchema = z.object({
  section: draftText(40),
  seconds: draftNumber(0, 0, 900),
  content: draftText(800),
  visual: draftText(300),
});

export type ScriptDraftOutlineItem = z.infer<typeof scriptDraftOutlineItemSchema>;

export const scriptDraftSchema = z.object({
  titles: draftStringArray(60, SCRIPT_TITLES_MAX),
  hook: draftText(300),
  outline: draftArray(scriptDraftOutlineItemSchema, SCRIPT_OUTLINE_MAX),
  tags: draftStringArray(24, 10),
  coverCopy: draftText(60),
  cta: draftText(120),
});

export type ScriptDraft = z.infer<typeof scriptDraftSchema>;

export function emptyOutlineItem(): ScriptDraftOutlineItem {
  return { section: "", seconds: 0, content: "", visual: "" };
}

/** 完全空白但可直接编辑的草稿；至少保留一个分段行，避免用户对着空表单发懵。 */
export function emptyScriptDraft(topicTitle?: string | null): ScriptDraft {
  const title = typeof topicTitle === "string" ? topicTitle.trim().slice(0, 60) : "";
  return {
    titles: title.length > 0 ? [title] : [],
    hook: "",
    outline: [emptyOutlineItem()],
    tags: [],
    coverCopy: "",
    cta: "",
  };
}

/** 从模型原文里挑出最可能代表「一份脚本」的那个对象。 */
function pickScriptCandidate(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return record["script"] ?? record["data"] ?? record["item"] ?? value;
  }

  return null;
}

/**
 * 尽最大努力把模型原文转成一份可编辑草稿：
 * 能解析出多少就保留多少，缺失字段降级为空值，保证前端永远拿到固定结构。
 */
export function buildScriptDraft(rawText: string, topicTitle?: string | null): ScriptDraft {
  const parsed = scriptDraftSchema.safeParse(pickScriptCandidate(safeExtractJsonValue(rawText)));
  const draft: ScriptDraft = parsed.success ? parsed.data : emptyScriptDraft();

  if (draft.titles.length === 0) {
    const fallback = typeof topicTitle === "string" ? topicTitle.trim().slice(0, 60) : "";
    if (fallback.length > 0) {
      draft.titles = [fallback];
    }
  }

  if (draft.outline.length === 0) {
    draft.outline = [emptyOutlineItem()];
  }

  return draft;
}