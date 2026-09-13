import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { TOPIC_PAGE_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toTopicDto } from "@/lib/dto";
import {
  decodeTopicCursor,
  encodeTopicCursor,
  listTopicsQuerySchema,
  saveTopicsSchema,
} from "@/lib/topics/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 游标分页的历史列表：按 createdAt + id 倒序，不提供页码。 */
export const GET = withAuthedRoute(async (request, _context, user) => {
  const url = new URL(request.url);
  const query = listTopicsQuerySchema.parse(Object.fromEntries(url.searchParams));

  const limit = query.limit ?? TOPIC_PAGE_SIZE;
  const cursor = query.cursor ? decodeTopicCursor(query.cursor) : null;

  if (query.cursor && !cursor) {
    throw new ApiError(ErrorCode.BAD_REQUEST, "分页游标不合法");
  }

  const where: Prisma.TopicIdeaWhereInput = { userId: user.id };
  if (query.includeDiscarded !== "1") {
    where.isDiscarded = false;
  }
  if (query.favorite === "1") {
    where.isFavorite = true;
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
  const rows = await prisma.topicIdea.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return ok({
    topics: page.map(toTopicDto),
    nextCursor: hasMore && last ? encodeTopicCursor(last.createdAt, last.id) : null,
  });
});

/**
 * 人工保存选题（不调用 AI、不消耗配额）。
 * 用途：AI 二次校验失败后的「可编辑草稿」需要能落库，否则降级流程无意义。
 */
export const POST = withAuthedRoute(async (request, _context, user) => {
  const input = saveTopicsSchema.parse(await readJson(request));

  const profile = await prisma.creatorProfile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (!profile) {
    throw new ApiError(ErrorCode.NOT_FOUND, "请先完成账号画像");
  }

  const batchId = input.batchId ?? randomUUID();

  const rows = await prisma.$transaction(
    input.items.map((item) =>
      prisma.topicIdea.create({
        data: {
          userId: user.id,
          profileId: profile.id,
          batchId,
          title: item.title,
          angle: item.angle ?? "",
          reason: item.reason ?? "",
          referenceDirection: item.referenceDirection ?? "",
          keywords: JSON.stringify(item.keywords ?? []),
          score: item.score ?? 0,
          difficulty: item.difficulty && item.difficulty.length > 0 ? item.difficulty : "medium",
          source: "edited",
          profileSnapshot: "{}",
        },
      }),
    ),
  );

  return ok({ batchId, topics: rows.map(toTopicDto) }, { status: 201 });
});
