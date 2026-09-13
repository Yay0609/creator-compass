import "server-only";

import type { CreatorProfile, TopicIdea } from "@prisma/client";

import { createAttemptLogger, type AttemptLogger } from "@/lib/ai/attempt-log";
import { AiError } from "@/lib/ai/errors";
import { extractJsonValue } from "@/lib/ai/json";
import { buildProfileSnapshot, parseJsonArray } from "@/lib/ai/profile-snapshot";
import {
  buildScriptMessages,
  buildScriptRepairMessages,
  type ScriptPromptContext,
} from "@/lib/ai/prompts/script";
import { callChatJson, type ChatJsonResult, type ChatMessage } from "@/lib/ai/provider";
import {
  buildScriptDraft,
  scriptOutputSchema,
  type ScriptDraft,
  type ScriptOutput,
} from "@/lib/ai/schemas/script";
import { describeIssues } from "@/lib/ai/validate";
import {
  CONTENT_FORMATS,
  GOALS,
  PLATFORMS,
  SCRIPT_PROMPT_VERSION,
  TONES,
  optionLabel,
} from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toScriptDto } from "@/lib/dto";
import { getEnv } from "@/lib/env";
import type { ScriptDto, SseScriptProgress } from "@/lib/scripts/schemas";

/**
 * 脚本生成编排：拼 prompt -> 调网关 -> 解析 JSON -> Zod 校验
 * -> 失败则追加一次修复调用 -> 二次失败抛出「带草稿」的错误交由路由降级。
 *
 * 本模块不碰配额：配额由路由预占与回滚，避免把 AI 调用包进事务。
 */

export class AiScriptInvalidOutputError extends Error {
  readonly draft: ScriptDraft;
  readonly issues: string[];

  constructor(message: string, draft: ScriptDraft, issues: string[]) {
    super(message);
    this.name = "AiScriptInvalidOutputError";
    this.draft = draft;
    this.issues = issues;
  }
}

export type GenerateScriptParams = {
  userId: string;
  profile: CreatorProfile;
  /** 来源选题；手动输入标题时为 null */
  topic: TopicIdea | null;
  /** 手动输入的标题（与 topic 二选一） */
  title: string | null;
  batchId: string;
  extraNote: string | null;
  durationSec: number;
  signal?: AbortSignal;
  onProgress?: (progress: SseScriptProgress) => void;
};

export type GenerateScriptResult = {
  batchId: string;
  model: string;
  latencyMs: number;
  attempts: number;
  script: ScriptDto;
};

/** 生成时的选题快照（只读），避免选题日后被修改 / 删除导致上下文漂移。 */
export function buildTopicSnapshot(topic: TopicIdea | null, title: string | null): string {
  return JSON.stringify({
    capturedAt: new Date().toISOString(),
    promptVersion: SCRIPT_PROMPT_VERSION,
    topicId: topic?.id ?? null,
    title: topic?.title ?? title,
    angle: topic?.angle ?? null,
    reason: topic?.reason ?? null,
    keywords: topic ? parseJsonArray(topic.keywords) : [],
  });
}

function toPromptContext(
  profile: CreatorProfile,
  params: GenerateScriptParams,
): ScriptPromptContext {
  const formats = parseJsonArray(profile.contentFormats)
    .map((format) => optionLabel(CONTENT_FORMATS, format))
    .filter((label) => label.length > 0);

  return {
    platformLabel: optionLabel(PLATFORMS, profile.platform),
    niche: profile.niche,
    subNiche: profile.subNiche,
    positioning: profile.positioning,
    targetAudience: profile.targetAudience,
    tone: profile.tone === null ? null : optionLabel(TONES, profile.tone),
    followerCount: profile.followerCount,
    goalLabel: profile.goal === null ? null : optionLabel(GOALS, profile.goal),
    contentFormats: formats,
    topicTitle: params.topic?.title ?? params.title,
    topicAngle: params.topic?.angle ?? null,
    topicReason: params.topic?.reason ?? null,
    topicKeywords: params.topic ? parseJsonArray(params.topic.keywords) : [],
    extraNote: params.extraNote,
    durationSec: params.durationSec,
  };
}

type ValidationOutcome = { ok: true; script: ScriptOutput } | { ok: false; issues: string[] };

function validateScript(text: string): ValidationOutcome {
  let raw: unknown;
  try {
    raw = extractJsonValue(text);
  } catch (error) {
    return {
      ok: false,
      issues: [error instanceof Error ? error.message : "无法解析模型返回的 JSON"],
    };
  }

  const parsed = scriptOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: describeIssues(parsed.error) };
  }

  return { ok: true, script: parsed.data };
}

export async function generateScript(params: GenerateScriptParams): Promise<GenerateScriptResult> {
  const model = getEnv().OPENAI_MODEL;
  const context = toPromptContext(params.profile, params);
  const logger = createAttemptLogger({
    userId: params.userId,
    kind: "script",
    model,
    requestId: params.batchId,
    signal: params.signal,
  });

  const startedAt = Date.now();
  params.onProgress?.({ phase: "calling", chars: 0, attempt: 1 });

  const first = await callAndLog(buildScriptMessages(context), params, logger);
  params.onProgress?.({
    phase: "parsing",
    chars: first.text.length,
    attempt: first.attempts.length,
  });

  let attemptsUsed = first.attempts.length;
  const firstOutcome = validateScript(first.text);
  let output: ScriptOutput;

  if (firstOutcome.ok) {
    output = firstOutcome.script;
    params.onProgress?.({ phase: "validating", chars: first.text.length, attempt: attemptsUsed });
  } else {
    // 校验失败：把问题回传给模型，只重试一次
    params.onProgress?.({
      phase: "repairing",
      chars: first.text.length,
      attempt: attemptsUsed + 1,
    });

    const repaired: ChatJsonResult = await callAndLog(
      buildScriptRepairMessages(context, first.text, firstOutcome.issues),
      params,
      logger,
    );
    attemptsUsed += repaired.attempts.length;

    params.onProgress?.({
      phase: "validating",
      chars: repaired.text.length,
      attempt: attemptsUsed,
    });

    const secondOutcome = validateScript(repaired.text);
    if (!secondOutcome.ok) {
      throw new AiScriptInvalidOutputError(
        "AI 连续两次输出都不符合格式，已保留可编辑草稿",
        buildScriptDraft(repaired.text, context.topicTitle),
        secondOutcome.issues,
      );
    }

    output = secondOutcome.script;
  }

  const row = await prisma.script.create({
    data: {
      userId: params.userId,
      topicId: params.topic?.id ?? null,
      profileId: params.profile.id,
      batchId: params.batchId,
      titles: JSON.stringify(output.titles),
      hook: output.hook,
      outline: JSON.stringify(
        output.outline.map((item) => ({
          section: item.section,
          seconds: item.seconds,
          content: item.content,
          visual: item.visual ?? "",
        })),
      ),
      tags: JSON.stringify(output.tags),
      coverCopy: output.coverCopy,
      cta: output.cta ?? null,
      platform: params.profile.platform,
      durationSec: params.durationSec,
      source: "ai",
      model,
      topicSnapshot: buildTopicSnapshot(params.topic, params.title),
      profileSnapshot: buildProfileSnapshot(params.profile, SCRIPT_PROMPT_VERSION),
    },
  });

  return {
    batchId: params.batchId,
    model,
    latencyMs: Date.now() - startedAt,
    attempts: attemptsUsed,
    script: toScriptDto(row),
  };
}

/** 调用网关并把本次的所有尝试写进 AiCallLog（成功与失败都要记）。 */
async function callAndLog(
  messages: ChatMessage[],
  params: GenerateScriptParams,
  logger: AttemptLogger,
): Promise<ChatJsonResult> {
  const promptChars = messages.reduce((total, message) => total + message.content.length, 0);

  try {
    const result = await callChatJson({ messages, signal: params.signal });
    await logger.write(result.attempts, {
      promptChars: result.promptChars,
      outputChars: result.text.length,
    });
    return result;
  } catch (error) {
    if (error instanceof AiError) {
      // 失败也要留痕：prompt 只记长度，绝不落原文
      await logger.write(error.attempts, { promptChars, outputChars: 0 });
    }
    throw error;
  }
}