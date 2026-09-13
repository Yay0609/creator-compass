import type {
  CreatorProfile,
  PostRecord,
  Prisma,
  ReviewReport,
  Script,
  TopicIdea,
  User,
} from "@prisma/client";

import type { ProfileInput } from "@/lib/auth/schemas";
import { baselineSchema, computePostMetrics, type Baseline, type PostDto } from "@/lib/posts/schemas";
import type {
  ReviewDiagnosticDto,
  ReviewDto,
  ReviewNextTopicDto,
  ReviewPostSnapshotDto,
} from "@/lib/reviews/schemas";
import type { ScriptDto, ScriptOutlineItemDto } from "@/lib/scripts/schemas";
import type { TopicDto } from "@/lib/topics/schemas";

export type PublicUser = {
  id: string;
  email: string;
  nickname: string | null;
  createdAt: string;
};

/** 只暴露可以给到前端的用户字段，绝不含 passwordHash。 */
export function toPublicUser(
  user: Pick<User, "id" | "email" | "nickname" | "createdAt">,
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    createdAt: user.createdAt.toISOString(),
  };
}

export type ProfileDto = {
  id: string;
  name: string;
  platform: string;
  niche: string;
  positioning: string | null;
  targetAudience: string | null;
  tone: string | null;
  contentFormats: string[];
  followerCount: number | null;
  weeklyCapacity: number | null;
  goal: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // 数据损坏时退化为空数组，不影响页面渲染
  }
  return [];
}

export function toProfileDto(profile: CreatorProfile): ProfileDto {
  return {
    id: profile.id,
    name: profile.name,
    platform: profile.platform,
    niche: profile.niche,
    positioning: profile.positioning,
    targetAudience: profile.targetAudience,
    tone: profile.tone,
    contentFormats: parseStringArray(profile.contentFormats),
    followerCount: profile.followerCount,
    weeklyCapacity: profile.weeklyCapacity,
    goal: profile.goal,
    isDefault: profile.isDefault,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** 表单输入 → 数据库写入数据（创建）。 */
export function toProfileCreateData(
  input: ProfileInput,
): Prisma.CreatorProfileCreateWithoutUserInput {
  return {
    name: input.name,
    platform: input.platform,
    niche: input.niche,
    positioning: emptyToNull(input.positioning),
    targetAudience: emptyToNull(input.targetAudience),
    tone: emptyToNull(input.tone),
    contentFormats: JSON.stringify(input.contentFormats),
    followerCount: input.followerCount,
    weeklyCapacity: input.weeklyCapacity,
    goal: emptyToNull(input.goal),
    isDefault: true,
  };
}

/** 表单输入 → 数据库写入数据（局部更新，只处理显式传入的字段）。 */
export function toProfileUpdateData(
  input: Partial<ProfileInput>,
): Prisma.CreatorProfileUpdateInput {
  const data: Prisma.CreatorProfileUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.platform !== undefined) data.platform = input.platform;
  if (input.niche !== undefined) data.niche = input.niche;
  if (input.positioning !== undefined) data.positioning = emptyToNull(input.positioning);
  if (input.targetAudience !== undefined) data.targetAudience = emptyToNull(input.targetAudience);
  if (input.tone !== undefined) data.tone = emptyToNull(input.tone);
  if (input.contentFormats !== undefined)
    data.contentFormats = JSON.stringify(input.contentFormats);
  if (input.followerCount !== undefined) data.followerCount = input.followerCount;
  if (input.weeklyCapacity !== undefined) data.weeklyCapacity = input.weeklyCapacity;
  if (input.goal !== undefined) data.goal = emptyToNull(input.goal);

  return data;
}
/** 选题 → 对外 DTO。keywords 存的是 JSON 字符串，这里解析成数组。 */
export function toTopicDto(topic: TopicIdea): TopicDto {
  return {
    id: topic.id,
    batchId: topic.batchId,
    title: topic.title,
    angle: topic.angle ?? "",
    reason: topic.reason,
    referenceDirection: topic.referenceDirection,
    keywords: parseStringArray(topic.keywords),
    score: topic.score,
    difficulty: topic.difficulty ?? "",
    source: topic.source,
    isFavorite: topic.isFavorite,
    isDiscarded: topic.isDiscarded,
    createdAt: topic.createdAt.toISOString(),
  };
}

// ---------- 脚本（P3） ----------

/** 分段脚本存的是 JSON 字符串；数据损坏时退化为空数组，不影响页面渲染。 */
function parseOutline(raw: string): ScriptOutlineItemDto[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (item === null || typeof item !== "object") {
        return [];
      }

      const record = item as Record<string, unknown>;
      const section = typeof record["section"] === "string" ? record["section"] : "";
      const content = typeof record["content"] === "string" ? record["content"] : "";
      const rawSeconds = record["seconds"];

      if (section.trim().length === 0 && content.trim().length === 0) {
        return [];
      }

      return [
        {
          section,
          seconds:
            typeof rawSeconds === "number" && Number.isFinite(rawSeconds)
              ? Math.round(rawSeconds)
              : 0,
          content,
          visual: typeof record["visual"] === "string" ? record["visual"] : "",
        },
      ];
    });
  } catch {
    return [];
  }
}

/** 完整口播稿由分段派生（不落库），避免同一份内容两处存储导致不一致。 */
function deriveFullScript(outline: ScriptOutlineItemDto[]): string {
  return outline
    .map((item) => (item.section.trim().length > 0 ? `【${item.section}】\n${item.content}` : item.content))
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
}

function parseTopicTitle(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object") {
      const title = (parsed as Record<string, unknown>)["title"];
      if (typeof title === "string" && title.trim().length > 0) {
        return title;
      }
    }
  } catch {
    // 快照损坏时按「无来源选题」处理
  }
  return null;
}

/** 脚本 → 对外 DTO。titles / outline / tags 存的是 JSON 字符串，这里解析成结构化数据。 */
export function toScriptDto(script: Script): ScriptDto {
  const titles = parseStringArray(script.titles);
  const outline = parseOutline(script.outline);

  return {
    id: script.id,
    batchId: script.batchId,
    topicId: script.topicId,
    topicTitle: parseTopicTitle(script.topicSnapshot),
    titles,
    title: titles[0] ?? "（未命名脚本）",
    hook: script.hook,
    outline,
    tags: parseStringArray(script.tags),
    coverCopy: script.coverCopy,
    cta: script.cta ?? "",
    fullScript: deriveFullScript(outline),
    totalSeconds: outline.reduce((total, item) => total + item.seconds, 0),
    platform: script.platform ?? "",
    source: script.source,
    model: script.model ?? null,
    isFavorite: script.isFavorite,
    isDiscarded: script.isDiscarded,
    editedAt: script.editedAt ? script.editedAt.toISOString() : null,
    createdAt: script.createdAt.toISOString(),
    updatedAt: script.updatedAt.toISOString(),
  };
}

// ---------- 作品数据（P4） ----------

/** 作品 → 对外 DTO。互动率等派生指标在 DTO 层计算，不落库。 */
export function toPostDto(post: PostRecord, scriptTitle: string | null = null): PostDto {
  return {
    id: post.id,
    scriptId: post.scriptId,
    scriptTitle,
    platform: post.platform ?? "",
    title: post.title,
    publishedAt: post.publishedAt.toISOString(),
    impressions: post.impressions,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    saves: post.saves,
    shares: post.shares,
    followsGained: post.followsGained,
    completionRate: post.completionRate,
    note: post.note ?? "",
    source: post.source,
    metrics: computePostMetrics(post),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

// ---------- 复盘（P4） ----------

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // 快照损坏时按空对象处理
  }
  return {};
}

function parseDiagnostics(raw: string): ReviewDiagnosticDto[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (item === null || typeof item !== "object") {
        return [];
      }
      const record = item as Record<string, unknown>;
      const text = (key: string): string => (typeof record[key] === "string" ? (record[key] as string) : "");
      const diagnostic = {
        dimension: text("dimension"),
        verdict: text("verdict"),
        evidence: text("evidence"),
        suggestion: text("suggestion"),
      };
      return diagnostic.verdict.length === 0 &&
        diagnostic.evidence.length === 0 &&
        diagnostic.suggestion.length === 0
        ? []
        : [diagnostic];
    });
  } catch {
    return [];
  }
}

function parseNextTopics(raw: string): ReviewNextTopicDto[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (item === null || typeof item !== "object") {
        return [];
      }
      const record = item as Record<string, unknown>;
      const title = typeof record["title"] === "string" ? record["title"] : "";
      const reason = typeof record["reason"] === "string" ? record["reason"] : "";
      return title.trim().length === 0 ? [] : [{ title, reason }];
    });
  } catch {
    return [];
  }
}

/** 从作品快照里解析逐条作品数据（报告图表与表格用）。 */
function parsePostSnapshots(raw: string): ReviewPostSnapshotDto[] {
  const snapshot = parseJsonObject(raw);
  const posts = snapshot["posts"];
  if (!Array.isArray(posts)) {
    return [];
  }

  return posts.flatMap((item) => {
    if (item === null || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const text = (key: string): string => (typeof record[key] === "string" ? (record[key] as string) : "");
    const num = (key: string): number | null => {
      const value = record[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    };

    const title = text("title");
    if (title.trim().length === 0) {
      return [];
    }

    const metrics =
      record["metrics"] !== null && typeof record["metrics"] === "object"
        ? (record["metrics"] as Record<string, unknown>)
        : {};
    const interactionRate =
      typeof metrics["interactionRate"] === "number" && Number.isFinite(metrics["interactionRate"])
        ? (metrics["interactionRate"] as number)
        : null;

    return [
      {
        id: text("id"),
        title,
        publishedAt: text("publishedAt"),
        views: num("views"),
        likes: num("likes"),
        saves: num("saves"),
        followsGained: num("followsGained"),
        completionRate: num("completionRate"),
        interactionRate,
      },
    ];
  });
}

/** 从作品快照里取标题，用于列表展示（作品被删除后仍可读）。 */
function parsePostTitles(raw: string): string[] {
  const snapshot = parseJsonObject(raw);
  const posts = snapshot["posts"];
  if (!Array.isArray(posts)) {
    return [];
  }

  return posts.flatMap((item) => {
    if (item === null || typeof item !== "object") {
      return [];
    }
    const title = (item as Record<string, unknown>)["title"];
    return typeof title === "string" && title.trim().length > 0 ? [title] : [];
  });
}

const EMPTY_BASELINE: Baseline = {
  sampleSize: 0,
  periodStart: null,
  periodEnd: null,
  metrics: [],
};

function parseBaseline(raw: string): Baseline {
  const parsed = baselineSchema.safeParse(parseJsonObject(raw));
  return parsed.success ? parsed.data : EMPTY_BASELINE;
}

/** 复盘报告 → 对外 DTO。JSON 字段在这里解析，快照损坏时退化为空值不影响页面。 */
export function toReviewDto(review: ReviewReport): ReviewDto {
  return {
    id: review.id,
    batchId: review.batchId,
    scope: review.scope,
    postIds: parseStringArray(review.postIds),
    postTitles: parsePostTitles(review.postSnapshot),
    posts: parsePostSnapshots(review.postSnapshot),
    sampleSize: review.sampleSize,
    periodStart: review.periodStart ? review.periodStart.toISOString() : null,
    periodEnd: review.periodEnd ? review.periodEnd.toISOString() : null,
    summary: review.summary,
    diagnostics: parseDiagnostics(review.diagnostics),
    highlights: parseStringArray(review.highlights),
    problems: parseStringArray(review.problems),
    suggestions: parseStringArray(review.suggestions),
    nextTopics: parseNextTopics(review.nextTopics),
    baselineNote: review.baselineNote,
    baseline: parseBaseline(review.baselineSnapshot),
    model: review.model ?? null,
    source: review.source,
    isFavorite: review.isFavorite,
    isDiscarded: review.isDiscarded,
    editedAt: review.editedAt ? review.editedAt.toISOString() : null,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}