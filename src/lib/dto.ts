import type { CreatorProfile, Prisma, Script, TopicIdea, User } from "@prisma/client";

import type { ProfileInput } from "@/lib/auth/schemas";
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
