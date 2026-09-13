import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { SCRIPT_PAGE_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toScriptDto } from "@/lib/dto";
import {
  decodeScriptCursor,
  encodeScriptCursor,
  listScriptsQuerySchema,
  saveScriptSchema,
} from "@/lib/scripts/schemas";
import { buildTopicSnapshot } from "@/lib/scripts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 游标分页的历史列表：按 createdAt + id 倒序，不提供页码。 */
export const GET = withAuthedRoute(async (request, _context, user) => {
  const url = new URL(request.url);
  const query = listScriptsQuerySchema.parse(Object.fromEntries(url.searchParams));

  const limit = query.limit ?? SCRIPT_PAGE_SIZE;
  const cursor = query.cursor ? decodeScriptCursor(query.cursor) : null;

  if (query.cursor && !cursor) {
    throw new ApiError(ErrorCode.BAD_REQUEST, "分页游标不合法");
  }

  const where: Prisma.ScriptWhereInput = { userId: user.id };
  if (query.includeDiscarded !== "1") {
    where.isDiscarded = false;
  }
  if (query.favorite === "1") {
    where.isFavorite = true;
  }
  if (query.topicId) {
    where.topicId = query.topicId;
  }
  if (cursor) {
    where.AND = [
      {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  // 多取一条用于判断是否还有下一页
  const rows = await prisma.script.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return ok({
    scripts: page.map(toScriptDto),
    nextCursor: hasMore && last ? encodeScriptCursor(last.createdAt, last.id) : null,
  });
});

/**
 * 人工保存脚本（不调用 AI、不消耗配额）。
 * 用途：AI 二次校验失败后的「可编辑草稿」需要能落库，否则降级流程无意义。
 */
export const POST = withAuthedRoute(async (request, _context, user) => {
  const input = saveScriptSchema.parse(await readJson(request));

  const profile = await prisma.creatorProfile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (!profile) {
    throw new ApiError(ErrorCode.NOT_FOUND, "请先完成账号画像");
  }

  const topic = input.topicId
    ? await prisma.topicIdea.findFirst({ where: { id: input.topicId, userId: user.id } })
    : null;

  if (input.topicId !== undefined && !topic) {
    throw new ApiError(ErrorCode.NOT_FOUND, "选题不存在");
  }

  const row = await prisma.script.create({
    data: {
      userId: user.id,
      topicId: topic?.id ?? null,
      profileId: profile.id,
      batchId: input.batchId ?? randomUUID(),
      titles: JSON.stringify(input.titles),
      hook: input.hook ?? "",
      outline: JSON.stringify(
        (input.outline ?? []).map((item) => ({
          section: item.section ?? "",
          seconds: item.seconds ?? 0,
          content: item.content ?? "",
          visual: item.visual ?? "",
        })),
      ),
      tags: JSON.stringify(input.tags ?? []),
      coverCopy: input.coverCopy ?? "",
      cta: input.cta ?? null,
      platform: profile.platform,
      durationSec: input.durationSec ?? null,
      source: "edited",
      topicSnapshot: buildTopicSnapshot(topic, input.titles[0] ?? null),
      profileSnapshot: "{}",
      editedAt: new Date(),
    },
  });

  return ok({ script: toScriptDto(row) }, { status: 201 });
});