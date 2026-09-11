import type { CreatorProfile, Prisma, User } from "@prisma/client";

import type { ProfileInput } from "@/lib/auth/schemas";

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
export function toProfileCreateData(input: ProfileInput): Prisma.CreatorProfileCreateWithoutUserInput {
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
  if (input.contentFormats !== undefined) data.contentFormats = JSON.stringify(input.contentFormats);
  if (input.followerCount !== undefined) data.followerCount = input.followerCount;
  if (input.weeklyCapacity !== undefined) data.weeklyCapacity = input.weeklyCapacity;
  if (input.goal !== undefined) data.goal = emptyToNull(input.goal);

  return data;
}