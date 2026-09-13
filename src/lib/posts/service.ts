import "server-only";

import type { PostRecord, Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { prisma } from "@/lib/db/prisma";
import { analyzeCsv, parseDateInput, postDuplicateKey, type CsvPreview, type PostFieldKey } from "@/lib/posts/csv";
import type { PostInput } from "@/lib/posts/schemas";

/**
 * 作品数据编排：写入前的归一化、CSV 预览（不写库）、批量导入（整体事务）。
 * 所有查询必须带 userId；查不到一律当作不存在。
 */

/** 把校验通过的入参转成数据库写入数据；日期在这里统一转成 Date。 */
function toCreateData(
  input: PostInput,
  defaults: { platform: string },
): Omit<Prisma.PostRecordUncheckedCreateInput, "userId" | "profileId" | "source"> {
  const publishedAt = parseDateInput(input.publishedAt);

  if (publishedAt === null) {
    throw new ApiError(ErrorCode.VALIDATION_FAILED, "发布时间格式无法识别");
  }

  return {
    scriptId: input.scriptId ?? null,
    platform: input.platform ?? defaults.platform,
    title: input.title,
    publishedAt,
    impressions: input.impressions ?? null,
    views: input.views ?? null,
    likes: input.likes ?? null,
    comments: input.comments ?? null,
    saves: input.saves ?? null,
    shares: input.shares ?? null,
    followsGained: input.followsGained ?? null,
    completionRate: input.completionRate ?? null,
    note: input.note ?? null,
  };
}

/** 未指定平台时回落到画像平台，保证每条作品都有平台可统计。 */
export async function loadDefaultProfile(userId: string): Promise<{ id: string; platform: string }> {
  const profile = await prisma.creatorProfile.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, platform: true },
  });

  if (!profile) {
    throw new ApiError(ErrorCode.NOT_FOUND, "请先完成账号画像");
  }

  return profile;
}

/** 已录入作品（标题 + 发布时间）的重复判定键，用于 CSV 预览标记「疑似重复」。 */
export async function existingDuplicateKeys(userId: string): Promise<Set<string>> {
  const rows = await prisma.postRecord.findMany({
    where: { userId },
    select: { title: true, publishedAt: true },
    orderBy: { publishedAt: "desc" },
    take: 2_000,
  });

  return new Set(rows.map((row) => postDuplicateKey(row.title, row.publishedAt)));
}

/** CSV 预览：解析 + 列映射 + 逐行校验 + 疑似重复标记，全程不写库。 */
export async function previewImport(
  userId: string,
  csv: string,
  mapping?: Record<string, PostFieldKey>,
): Promise<CsvPreview> {
  return analyzeCsv(csv, mapping, await existingDuplicateKeys(userId));
}

/** 单条录入。 */
export async function createPost(
  userId: string,
  profileId: string,
  profilePlatform: string,
  input: PostInput,
): Promise<PostRecord> {
  await assertScriptOwnership(userId, input.scriptId);

  return prisma.postRecord.create({
    data: {
      ...toCreateData(input, { platform: profilePlatform }),
      userId,
      profileId,
      source: "manual",
    },
  });
}

/** 批量导入：整体事务，任一行失败则全部回滚（并回传行号）。 */
export async function commitImport(
  userId: string,
  profileId: string,
  profilePlatform: string,
  rows: PostInput[],
): Promise<number> {
  const scriptIds = rows
    .map((row) => row.scriptId)
    .filter((value): value is string => value !== undefined);

  if (scriptIds.length > 0) {
    const owned = await prisma.script.findMany({
      where: { userId, id: { in: scriptIds } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((row) => row.id));
    const missing = scriptIds.find((id) => !ownedIds.has(id));
    if (missing !== undefined) {
      throw new ApiError(ErrorCode.NOT_FOUND, "关联的脚本不存在");
    }
  }

  const data = rows.map((row, index) => {
    try {
      return {
        ...toCreateData(row, { platform: profilePlatform }),
        userId,
        profileId,
        source: "csv",
      };
    } catch {
      throw new ApiError(ErrorCode.VALIDATION_FAILED, `第 ${index + 1} 行数据不合法`, {
        row: index + 1,
      });
    }
  });

  const result = await prisma.postRecord.createMany({ data });
  return result.count;
}

/** 修正单条作品。 */
export async function updatePost(
  userId: string,
  id: string,
  input: Partial<PostInput>,
): Promise<PostRecord> {
  const existing = await prisma.postRecord.findFirst({ where: { id, userId } });

  if (!existing) {
    throw new ApiError(ErrorCode.NOT_FOUND, "作品不存在");
  }

  await assertScriptOwnership(userId, input.scriptId);

  const data: Prisma.PostRecordUncheckedUpdateInput = {};

  if (input.title !== undefined) data.title = input.title;
  if (input.publishedAt !== undefined) {
    const publishedAt = parseDateInput(input.publishedAt);
    if (publishedAt === null) {
      throw new ApiError(ErrorCode.VALIDATION_FAILED, "发布时间格式无法识别");
    }
    data.publishedAt = publishedAt;
  }
  if (input.platform !== undefined) data.platform = input.platform;
  if (input.scriptId !== undefined) data.scriptId = input.scriptId;
  if (input.impressions !== undefined) data.impressions = input.impressions;
  if (input.views !== undefined) data.views = input.views;
  if (input.likes !== undefined) data.likes = input.likes;
  if (input.comments !== undefined) data.comments = input.comments;
  if (input.saves !== undefined) data.saves = input.saves;
  if (input.shares !== undefined) data.shares = input.shares;
  if (input.followsGained !== undefined) data.followsGained = input.followsGained;
  if (input.completionRate !== undefined) data.completionRate = input.completionRate;
  if (input.note !== undefined) data.note = input.note;

  return prisma.postRecord.update({ where: { id: existing.id }, data });
}

/** 删除单条作品。历史复盘报告凭快照仍然可读，因此不做级联清理。 */
export async function deletePost(userId: string, id: string): Promise<void> {
  const result = await prisma.postRecord.deleteMany({ where: { id, userId } });

  if (result.count === 0) {
    throw new ApiError(ErrorCode.NOT_FOUND, "作品不存在");
  }
}

async function assertScriptOwnership(userId: string, scriptId: string | undefined): Promise<void> {
  if (scriptId === undefined) {
    return;
  }

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId },
    select: { id: true },
  });

  if (!script) {
    throw new ApiError(ErrorCode.NOT_FOUND, "关联的脚本不存在");
  }
}

/** 从 Script.titles(JSON) 里取主标题，用于列表展示。 */
export function scriptTitleOf(script: { titles: string } | null): string | null {
  if (!script) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(script.titles);
    if (Array.isArray(parsed)) {
      const first = parsed.find((item): item is string => typeof item === "string" && item.trim().length > 0);
      return first ?? null;
    }
  } catch {
    // titles 损坏时按无标题处理
  }

  return null;
}