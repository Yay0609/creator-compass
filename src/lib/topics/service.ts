import "server-only";

import type { CreatorProfile } from "@prisma/client";

import { AiError, type AiAttempt } from "@/lib/ai/errors";
import { extractJsonValue } from "@/lib/ai/json";
import {
  buildTopicMessages,
  buildTopicRepairMessages,
  type TopicPromptContext,
} from "@/lib/ai/prompts/topic";
import { callChatJson, type ChatJsonResult, type ChatMessage } from "@/lib/ai/provider";
import {
  buildTopicDraft,
  describeIssues,
  topicListSchema,
  type TopicDraftItem,
  type TopicItem,
} from "@/lib/ai/schemas/topic";
import {
  AI_PROMPT_VERSION,
  CONTENT_FORMATS,
  GOALS,
  PLATFORMS,
  TONES,
  optionLabel,
} from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toTopicDto } from "@/lib/dto";
import { getEnv } from "@/lib/env";
import type { SseProgress, TopicDto } from "@/lib/topics/schemas";

/**
 * 选题生成编排：拼 prompt -> 调网关 -> 解析 JSON -> Zod 校验
 * -> 失败则追加一次修复调用 -> 二次失败抛出「带草稿」的错误交由路由降级。
 *
 * 本模块不碰配额：配额由路由预占与回滚，避免把 AI 调用包进事务。
 */

export class AiInvalidOutputError extends Error {
  readonly draft: TopicDraftItem[];
  readonly issues: string[];

  constructor(message: string, draft: TopicDraftItem[], issues: string[]) {
    super(message);
    this.name = "AiInvalidOutputError";
    this.draft = draft;
    this.issues = issues;
  }
}

export type GenerateTopicsParams = {
  userId: string;
  profile: CreatorProfile;
  batchId: string;
  extraNote: string | null;
  excludeTitles: string[];
  signal?: AbortSignal;
  onProgress?: (progress: SseProgress) => void;
};

export type GenerateTopicsResult = {
  batchId: string;
  model: string;
  latencyMs: number;
  attempts: number;
  topics: TopicDto[];
};

function clip(value: string | null, max: number): string | null {
  if (value === null) {
    return null;
  }
  return value.length > max ? value.slice(0, max) : value;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // 数据损坏时退化为空数组
  }
  return [];
}

/** 生成时的画像快照（只读），避免画像日后被修改导致上下文漂移。 */
function buildProfileSnapshot(profile: CreatorProfile): string {
  return JSON.stringify({
    capturedAt: new Date().toISOString(),
    promptVersion: AI_PROMPT_VERSION,
    profileId: profile.id,
    name: clip(profile.name, 40),
    platform: profile.platform,
    niche: clip(profile.niche, 40),
    subNiche: clip(profile.subNiche, 40),
    positioning: clip(profile.positioning, 120),
    targetAudience: clip(profile.targetAudience, 120),
    tone: profile.tone,
    contentFormats: parseJsonArray(profile.contentFormats),
    followerCount: profile.followerCount,
    weeklyCapacity: profile.weeklyCapacity,
    goal: profile.goal,
  });
}

function toPromptContext(
  profile: CreatorProfile,
  params: GenerateTopicsParams,
): TopicPromptContext {
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
    weeklyCapacity: profile.weeklyCapacity,
    goalLabel: profile.goal === null ? null : optionLabel(GOALS, profile.goal),
    contentFormats: formats,
    extraNote: params.extraNote,
    excludeTitles: params.excludeTitles,
  };
}

type ValidationOutcome = { ok: true; items: TopicItem[] } | { ok: false; issues: string[] };

function validateTopics(text: string): ValidationOutcome {
  let raw: unknown;
  try {
    raw = extractJsonValue(text);
  } catch (error) {
    return {
      ok: false,
      issues: [error instanceof Error ? error.message : "无法解析模型返回的 JSON"],
    };
  }

  const parsed = topicListSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: describeIssues(parsed.error) };
  }

  return { ok: true, items: parsed.data.items };
}

type AttemptLogger = {
  write: (
    attempts: AiAttempt[],
    meta: { promptChars: number; outputChars: number },
  ) => Promise<void>;
};

/**
 * 每次尝试都落一条 AiCallLog（含重试与失败）。
 * 只写元数据：绝不记录 prompt 原文与模型原始输出。
 * 客户端已断开或写库失败都不影响主流程。
 */
function createAttemptLogger(options: {
  userId: string;
  kind: string;
  model: string;
  requestId: string;
  signal?: AbortSignal;
}): AttemptLogger {
  return {
    async write(attempts, meta) {
      if (options.signal?.aborted || attempts.length === 0) {
        return;
      }

      try {
        await prisma.$transaction(
          attempts.map((attempt) =>
            prisma.aiCallLog.create({
              data: {
                userId: options.userId,
                kind: options.kind,
                model: options.model,
                status: attempt.status,
                attempt: attempt.attempt,
                httpStatus: attempt.httpStatus,
                latencyMs: attempt.latencyMs,
                errorCode: attempt.errorCode,
                totalTokens: attempt.totalTokens,
                promptChars: meta.promptChars,
                outputChars: meta.outputChars,
                requestId: options.requestId,
              },
            }),
          ),
        );
      } catch (error) {
        console.error("[ai] 写入 AiCallLog 失败", error);
      }
    },
  };
}

export async function generateTopics(params: GenerateTopicsParams): Promise<GenerateTopicsResult> {
  const model = getEnv().OPENAI_MODEL;
  const context = toPromptContext(params.profile, params);
  const logger = createAttemptLogger({
    userId: params.userId,
    kind: "topic",
    model,
    requestId: params.batchId,
    signal: params.signal,
  });

  const startedAt = Date.now();
  params.onProgress?.({ phase: "calling", chars: 0, attempt: 1 });

  const first = await callAndLog(buildTopicMessages(context), params, logger);
  params.onProgress?.({
    phase: "parsing",
    chars: first.text.length,
    attempt: first.attempts.length,
  });

  let attemptsUsed = first.attempts.length;
  const firstOutcome = validateTopics(first.text);
  let items: TopicItem[];

  if (firstOutcome.ok) {
    items = firstOutcome.items;
    params.onProgress?.({ phase: "validating", chars: first.text.length, attempt: attemptsUsed });
  } else {
    // 校验失败：把问题回传给模型，只重试一次
    params.onProgress?.({
      phase: "repairing",
      chars: first.text.length,
      attempt: attemptsUsed + 1,
    });

    const repaired: ChatJsonResult = await callAndLog(
      buildTopicRepairMessages(context, first.text, firstOutcome.issues),
      params,
      logger,
    );
    attemptsUsed += repaired.attempts.length;

    params.onProgress?.({
      phase: "validating",
      chars: repaired.text.length,
      attempt: attemptsUsed,
    });

    const secondOutcome = validateTopics(repaired.text);
    if (!secondOutcome.ok) {
      throw new AiInvalidOutputError(
        "AI 连续两次输出都不符合格式，已保留可编辑草稿",
        buildTopicDraft(repaired.text),
        secondOutcome.issues,
      );
    }

    items = secondOutcome.items;
  }

  const profileSnapshot = buildProfileSnapshot(params.profile);

  // SQLite 不支持 createMany，用事务数组逐条创建，保证「要么全成要么全不成」
  const rows = await prisma.$transaction(
    items.map((item) =>
      prisma.topicIdea.create({
        data: {
          userId: params.userId,
          profileId: params.profile.id,
          batchId: params.batchId,
          title: item.title,
          angle: item.angle,
          reason: item.reason,
          referenceDirection: item.referenceDirection,
          keywords: JSON.stringify(item.keywords),
          score: item.score,
          difficulty: item.difficulty,
          source: "ai",
          model,
          profileSnapshot,
        },
      }),
    ),
  );

  return {
    batchId: params.batchId,
    model,
    latencyMs: Date.now() - startedAt,
    attempts: attemptsUsed,
    topics: rows.map(toTopicDto),
  };
}

/** 调用网关并把本次的所有尝试写进 AiCallLog（成功与失败都要记）。 */
async function callAndLog(
  messages: ChatMessage[],
  params: GenerateTopicsParams,
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
