import "server-only";

import type { CreatorProfile } from "@prisma/client";

/** 画像相关的通用读取工具（选题 / 脚本共用）。 */

/** 截断文本，避免快照里塞入过长内容。 */
export function clip(value: string | null, max: number): string | null {
  if (value === null) {
    return null;
  }
  return value.length > max ? value.slice(0, max) : value;
}

/** 解析存成 JSON 字符串的数组；数据损坏时退化为空数组。 */
export function parseJsonArray(raw: string): string[] {
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

/**
 * 生成时的画像快照（只读），避免画像日后被修改导致上下文漂移。
 * promptVersion 由调用方给出，便于区分是选题还是脚本生成的。
 */
export function buildProfileSnapshot(profile: CreatorProfile, promptVersion: string): string {
  return JSON.stringify({
    capturedAt: new Date().toISOString(),
    promptVersion,
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