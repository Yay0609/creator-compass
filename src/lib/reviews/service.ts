import "server-only";

import type { CreatorProfile, PostRecord, Prisma, ReviewReport } from "@prisma/client";

import { createAttemptLogger, type AttemptLogger } from "@/lib/ai/attempt-log";
import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { AiError } from "@/lib/ai/errors";
import { extractJsonValue } from "@/lib/ai/json";
import { parseJsonArray } from "@/lib/ai/profile-snapshot";
import {
  buildReviewMessages,
  buildReviewRepairMessages,
  type ReviewPromptContext,
} from "@/lib/ai/prompts/review";
import { callChatJson, type ChatJsonResult, type ChatMessage } from "@/lib/ai/provider";
import {
  buildReviewDraft,
  reviewOutputSchema,
  type ReviewDraft,
  type ReviewOutput,
} from "@/lib/ai/schemas/review";
import { describeIssues } from "@/lib/ai/validate";
import {
  CONTENT_FORMATS,
  GOALS,
  PLATFORMS,
  REVIEW_PROMPT_VERSION,
  TONES,
  optionLabel,
} from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toReviewDto } from "@/lib/dto";
import { getEnv } from "@/lib/env";
import { toShanghaiDateString } from "@/lib/posts/csv";
import { computeBaseline, computePostMetrics, type BaselineSource } from "@/lib/posts/schemas";
import type {
  ReviewDto,
  SaveReviewInput,
  SseReviewProgress,
  UpdateReviewInput,
} from "@/lib/reviews/schemas";

/**
 * 复盘生成编排：拼 prompt -> 调网关 -> 解析 JSON -> Zod 校验
 * -> 失败则追加一次修复调用 -> 二次失败抛出「带草稿」的错误交由路由降级。
 *
 * 本模块不碰配额：配额由路由预占与回滚，避免把 AI 调用包进事务。
 */

export class AiReviewInvalidOutputError extends Error {
  readonly draft: ReviewDraft;
  readonly issues: string[];

  constructor(message: string, draft: ReviewDraft, issues: string[]) {
    super(message);
    this.name = "AiReviewInvalidOutputError";
    this.draft = draft;
    this.issues = issues;
  }
}

export type GenerateReviewParams = {
  userId: string;
  profile: CreatorProfile;
  /** 本次纳入的作品（已校验归属） */
  posts: PostRecord[];
  /** 用于基线统计的历史作品（已排除本次纳入的作品） */
  baselinePosts: PostRecord[];
  batchId: string;
  focus: string | null;
  signal?: AbortSignal;
  onProgress?: (progress: SseReviewProgress) => void;
};

export type GenerateReviewResult = {
  batchId: string;
  model: string;
  latencyMs: number;
  attempts: number;
  sampleSize: number;
  review: ReviewDto;
};

/** 作品 -> 基线统计入参。生成、人工保存、路由 meta 三处共用一份口径。 */
export function baselineSourceOf(post: PostRecord): BaselineSource {
  return {
    views: post.views,
    impressions: post.impressions,
    likes: post.likes,
    comments: post.comments,
    saves: post.saves,
    shares: post.shares,
    followsGained: post.followsGained,
    completionRate: post.completionRate,
    publishedAt: post.publishedAt,
  };
}

function formatCount(value: number | null): string | null {
  return value === null ? null : value.toLocaleString("zh-CN");
}

function formatRate(value: number | null): string | null {
  return value === null ? null : `${(value * 100).toFixed(1)}%`;
}

/** 单条作品的指标行：只写用户真的提供了的数据，缺失项直接省略。 */
function buildMetricLines(post: PostRecord): string[] {
  const metrics = computePostMetrics(post);
  const entries: Array<[string, string | null]> = [
    ["曝光", formatCount(post.impressions)],
    ["播放/阅读", formatCount(post.views)],
    ["点赞", formatCount(post.likes)],
    ["评论", formatCount(post.comments)],
    ["收藏", formatCount(post.saves)],
    ["分享", formatCount(post.shares)],
    ["涨粉", formatCount(post.followsGained)],
    ["完播率", formatRate(post.completionRate)],
    ["互动率", formatRate(metrics.interactionRate)],
    ["涨粉率", formatRate(metrics.followRate)],
  ];

  const lines = entries
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([label, value]) => `${label} ${value}`);

  return lines.length > 0 ? [lines.join(" ｜ ")] : ["（本条未提供任何数据）"];
}

function toPromptContext(
  profile: CreatorProfile,
  posts: PostRecord[],
  baselinePosts: PostRecord[],
  focus: string | null,
): ReviewPromptContext {
  const baseline = computeBaseline(baselinePosts.map(baselineSourceOf));

  const formats = parseJsonArray(profile.contentFormats)
    .map((format) => optionLabel(CONTENT_FORMATS, format))
    .filter((label) => label.length > 0);

  const lines = baseline.metrics
    .filter((metric) => metric.sampleSize > 0 && metric.mean !== null)
    .map((metric) => {
      const unit = metric.unit === "rate" ? "%" : "";
      const scale = metric.unit === "rate" ? 100 : 1;
      const digits = metric.unit === "rate" ? 1 : 0;
      const mean = ((metric.mean ?? 0) * scale).toFixed(digits);
      const median = ((metric.median ?? 0) * scale).toFixed(digits);
      const min = ((metric.min ?? 0) * scale).toFixed(digits);
      const max = ((metric.max ?? 0) * scale).toFixed(digits);
      return `${metric.label}：均值 ${mean}${unit} / 中位数 ${median}${unit}（范围 ${min}${unit}–${max}${unit}，样本 ${metric.sampleSize} 条）`;
    });

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
    posts: posts.map((post) => ({
      title: post.title,
      publishedAt: toShanghaiDateString(post.publishedAt),
      platformLabel: optionLabel(PLATFORMS, post.platform ?? profile.platform),
      metricLines: buildMetricLines(post),
      focus: posts.length === 1,
    })),
    baseline: {
      sampleSize: baseline.sampleSize,
      periodStart: baseline.periodStart === null ? null : toShanghaiDateString(new Date(baseline.periodStart)),
      periodEnd: baseline.periodEnd === null ? null : toShanghaiDateString(new Date(baseline.periodEnd)),
      lines,
    },
    focus,
  };
}
// ---------- 校验 ----------

type ValidationOutcome = { ok: true; review: ReviewOutput } | { ok: false; issues: string[] };

function validateReview(text: string): ValidationOutcome {
  let raw: unknown;
  try {
    raw = extractJsonValue(text);
  } catch (error) {
    return {
      ok: false,
      issues: [error instanceof Error ? error.message : "无法解析模型返回的 JSON"],
    };
  }

  const parsed = reviewOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: describeIssues(parsed.error) };
  }

  return { ok: true, review: parsed.data };
}

// ---------- 快照 ----------

/** 生成时纳入的作品快照（只读）：作品被删除或修改后，历史报告仍然可读。 */
function buildPostSnapshot(posts: PostRecord[]): string {
  return JSON.stringify({
    capturedAt: new Date().toISOString(),
    promptVersion: REVIEW_PROMPT_VERSION,
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      publishedAt: post.publishedAt.toISOString(),
      platform: post.platform,
      impressions: post.impressions,
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      saves: post.saves,
      shares: post.shares,
      followsGained: post.followsGained,
      completionRate: post.completionRate,
      metrics: computePostMetrics(post),
    })),
  });
}

function periodOf(posts: PostRecord[]): { start: Date | null; end: Date | null } {
  if (posts.length === 0) {
    return { start: null, end: null };
  }

  const times = posts.map((post) => post.publishedAt.getTime()).sort((left, right) => left - right);
  return {
    start: new Date(times[0] as number),
    end: new Date(times[times.length - 1] as number),
  };
}

// ---------- 生成 ----------

export async function generateReview(params: GenerateReviewParams): Promise<GenerateReviewResult> {
  const model = getEnv().OPENAI_MODEL;
  const context = toPromptContext(params.profile, params.posts, params.baselinePosts, params.focus);
  const logger = createAttemptLogger({
    userId: params.userId,
    kind: "review",
    model,
    requestId: params.batchId,
    signal: params.signal,
  });

  const startedAt = Date.now();
  params.onProgress?.({ phase: "calling", chars: 0, attempt: 1 });

  const first = await callAndLog(buildReviewMessages(context), params, logger);
  params.onProgress?.({
    phase: "parsing",
    chars: first.text.length,
    attempt: first.attempts.length,
  });

  let attemptsUsed = first.attempts.length;
  const firstOutcome = validateReview(first.text);
  let output: ReviewOutput;

  if (firstOutcome.ok) {
    output = firstOutcome.review;
    params.onProgress?.({ phase: "validating", chars: first.text.length, attempt: attemptsUsed });
  } else {
    params.onProgress?.({
      phase: "repairing",
      chars: first.text.length,
      attempt: attemptsUsed + 1,
    });

    const repaired: ChatJsonResult = await callAndLog(
      buildReviewRepairMessages(context, first.text, firstOutcome.issues),
      params,
      logger,
    );
    attemptsUsed += repaired.attempts.length;

    params.onProgress?.({
      phase: "validating",
      chars: repaired.text.length,
      attempt: attemptsUsed,
    });

    const secondOutcome = validateReview(repaired.text);
    if (!secondOutcome.ok) {
      throw new AiReviewInvalidOutputError(
        "AI 连续两次输出都不符合格式，已保留可编辑草稿",
        buildReviewDraft(repaired.text),
        secondOutcome.issues,
      );
    }

    output = secondOutcome.review;
  }

  const baseline = computeBaseline(params.baselinePosts.map(baselineSourceOf));
  const period = periodOf(params.posts);

  const row = await prisma.reviewReport.create({
    data: {
      userId: params.userId,
      profileId: params.profile.id,
      batchId: params.batchId,
      scope: params.posts.length === 1 ? "single" : "batch",
      postIds: JSON.stringify(params.posts.map((post) => post.id)),
      postSnapshot: buildPostSnapshot(params.posts),
      baselineSnapshot: JSON.stringify({
        capturedAt: new Date().toISOString(),
        promptVersion: REVIEW_PROMPT_VERSION,
        ...baseline,
      }),
      sampleSize: baseline.sampleSize,
      periodStart: period.start,
      periodEnd: period.end,
      summary: output.summary,
      diagnostics: JSON.stringify(output.diagnostics),
      highlights: JSON.stringify(output.highlights),
      problems: JSON.stringify(output.problems),
      suggestions: JSON.stringify(output.suggestions),
      nextTopics: JSON.stringify(output.nextTopics),
      baselineNote: output.baselineNote,
      promptVersion: REVIEW_PROMPT_VERSION,
      model,
      source: "ai",
    },
  });

  return {
    batchId: params.batchId,
    model,
    latencyMs: Date.now() - startedAt,
    attempts: attemptsUsed,
    sampleSize: baseline.sampleSize,
    review: toReviewDto(row),
  };
}

/** 调用网关并把本次的所有尝试写进 AiCallLog（成功与失败都要记）。 */
async function callAndLog(
  messages: ChatMessage[],
  params: GenerateReviewParams,
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
// ---------- 人工编辑 ----------

/**
 * 修正报告内容或切换收藏 / 忽略。
 * 内容字段一旦被改动就标记 source=edited + editedAt，方便区分「AI 原稿」与「人工稿」。
 */
export async function updateReviewReport(
  userId: string,
  id: string,
  input: UpdateReviewInput,
): Promise<ReviewReport> {
  const existing = await prisma.reviewReport.findFirst({ where: { id, userId } });

  if (!existing) {
    throw new ApiError(ErrorCode.NOT_FOUND, "复盘报告不存在");
  }

  const data: Prisma.ReviewReportUncheckedUpdateInput = {};
  let contentChanged = false;

  if (input.summary !== undefined) {
    data.summary = input.summary;
    contentChanged = true;
  }
  if (input.diagnostics !== undefined) {
    data.diagnostics = JSON.stringify(input.diagnostics);
    contentChanged = true;
  }
  if (input.highlights !== undefined) {
    data.highlights = JSON.stringify(input.highlights);
    contentChanged = true;
  }
  if (input.problems !== undefined) {
    data.problems = JSON.stringify(input.problems);
    contentChanged = true;
  }
  if (input.suggestions !== undefined) {
    data.suggestions = JSON.stringify(input.suggestions);
    contentChanged = true;
  }
  if (input.nextTopics !== undefined) {
    data.nextTopics = JSON.stringify(input.nextTopics);
    contentChanged = true;
  }
  if (input.baselineNote !== undefined) {
    data.baselineNote = input.baselineNote;
    contentChanged = true;
  }
  if (input.isFavorite !== undefined) {
    data.isFavorite = input.isFavorite;
  }
  if (input.isDiscarded !== undefined) {
    data.isDiscarded = input.isDiscarded;
  }

  if (contentChanged) {
    data.source = "edited";
    data.editedAt = new Date();
  }

  return prisma.reviewReport.update({ where: { id: existing.id }, data });
}
// ---------- 人工保存（不消耗配额） ----------

/** 基线最多纳入的历史作品数：生成与人工保存共用同一口径。 */
export const BASELINE_SAMPLE_LIMIT = 500;

/**
 * 直接保存一份人工报告：用于「AI 两次校验失败后的草稿」补全落库，也支持手动新建。
 * 快照与基线在这里重新计算并冻结，保证历史报告不随后续数据变化而漂移。
 */
export async function saveManualReview(
  userId: string,
  profile: CreatorProfile,
  input: SaveReviewInput,
  batchId: string,
): Promise<ReviewReport> {
  const uniqueIds = Array.from(new Set(input.postIds ?? []));

  const posts =
    uniqueIds.length === 0
      ? []
      : await prisma.postRecord.findMany({
          where: { userId, id: { in: uniqueIds } },
          orderBy: [{ publishedAt: "asc" }, { createdAt: "asc" }],
        });

  if (posts.length !== uniqueIds.length) {
    throw new ApiError(ErrorCode.NOT_FOUND, "有作品不存在或不属于当前账号");
  }

  const baselinePosts = await prisma.postRecord.findMany({
    where: { userId, id: { notIn: uniqueIds } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: BASELINE_SAMPLE_LIMIT,
  });

  const baseline = computeBaseline(baselinePosts.map(baselineSourceOf));
  const period = periodOf(posts);

  return prisma.reviewReport.create({
    data: {
      userId,
      profileId: profile.id,
      batchId,
      scope: posts.length === 1 ? "single" : "batch",
      postIds: JSON.stringify(posts.map((post) => post.id)),
      postSnapshot: buildPostSnapshot(posts),
      baselineSnapshot: JSON.stringify({
        capturedAt: new Date().toISOString(),
        promptVersion: REVIEW_PROMPT_VERSION,
        ...baseline,
      }),
      sampleSize: baseline.sampleSize,
      periodStart: period.start,
      periodEnd: period.end,
      summary: input.summary ?? "",
      diagnostics: JSON.stringify(input.diagnostics ?? []),
      highlights: JSON.stringify(input.highlights ?? []),
      problems: JSON.stringify(input.problems ?? []),
      suggestions: JSON.stringify(input.suggestions ?? []),
      nextTopics: JSON.stringify(input.nextTopics ?? []),
      baselineNote: input.baselineNote ?? "",
      promptVersion: null,
      model: null,
      source: "edited",
      editedAt: new Date(),
    },
  });
}