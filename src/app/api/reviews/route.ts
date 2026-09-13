import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { REVIEW_PAGE_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toReviewDto } from "@/lib/dto";
import {
  decodeReviewCursor,
  encodeReviewCursor,
  listReviewsQuerySchema,
  saveReviewSchema,
} from "@/lib/reviews/schemas";
import { saveManualReview } from "@/lib/reviews/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 复盘历史列表：游标分页（createdAt + id 倒序），支持只看收藏。 */
export const GET = withAuthedRoute(async (request, _context, user) => {
  const url = new URL(request.url);
  const query = listReviewsQuerySchema.parse(Object.fromEntries(url.searchParams));

  const limit = query.limit ?? REVIEW_PAGE_SIZE;
  const cursor = query.cursor ? decodeReviewCursor(query.cursor) : null;

  if (query.cursor && !cursor) {
    throw new ApiError(ErrorCode.BAD_REQUEST, "分页游标不合法");
  }

  const where: Prisma.ReviewReportWhereInput = { userId: user.id };

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

  const rows = await prisma.reviewReport.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return ok({
    reviews: page.map(toReviewDto),
    nextCursor: hasMore && last ? encodeReviewCursor(last.createdAt, last.id) : null,
  });
});
/**
 * 人工保存（不消耗配额）：AI 两次校验失败后的草稿补全后可在此落库。
 * postIds 只用于冻结快照与基线，作品归属校验由 service 负责。
 */
export const POST = withAuthedRoute(async (request, _context, user) => {
  const input = saveReviewSchema.parse(await readJson(request));
  const profile = await prisma.creatorProfile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (!profile) {
    throw new ApiError(ErrorCode.NOT_FOUND, "请先完成账号画像");
  }

  const row = await saveManualReview(user.id, profile, input, input.batchId ?? randomUUID());

  return ok({ review: toReviewDto(row) }, { status: 201 });
});