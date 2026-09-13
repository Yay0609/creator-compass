import type { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { POST_PAGE_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toPostDto } from "@/lib/dto";
import { parseDateInput } from "@/lib/posts/csv";
import {
  decodePostCursor,
  encodePostCursor,
  listPostsQuerySchema,
  postInputSchema,
} from "@/lib/posts/schemas";
import { createPost, loadDefaultProfile, scriptTitleOf } from "@/lib/posts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCRIPT_SELECT = { select: { titles: true } } as const;

/** 游标分页的作品列表：按 createdAt + id 倒序，支持平台 / 脚本 / 时间区间过滤。 */
export const GET = withAuthedRoute(async (request, _context, user) => {
  const url = new URL(request.url);
  const query = listPostsQuerySchema.parse(Object.fromEntries(url.searchParams));

  const limit = query.limit ?? POST_PAGE_SIZE;
  const cursor = query.cursor ? decodePostCursor(query.cursor) : null;

  if (query.cursor && !cursor) {
    throw new ApiError(ErrorCode.BAD_REQUEST, "分页游标不合法");
  }

  const where: Prisma.PostRecordWhereInput = { userId: user.id };

  if (query.platform) {
    where.platform = query.platform;
  }
  if (query.scriptId) {
    where.scriptId = query.scriptId;
  }

  const from = query.from ? parseDateInput(query.from) : null;
  const to = query.to ? parseDateInput(query.to) : null;

  if (query.from && !from) {
    throw new ApiError(ErrorCode.BAD_REQUEST, "起始日期格式无法识别");
  }
  if (query.to && !to) {
    throw new ApiError(ErrorCode.BAD_REQUEST, "结束日期格式无法识别");
  }
  if (from || to) {
    where.publishedAt = {
      ...(from ? { gte: from } : {}),
      // 结束日期按「当天结束」处理：日期型输入落在 12:00，加一天即可覆盖整天
      ...(to ? { lt: new Date(to.getTime() + 24 * 60 * 60 * 1000) } : {}),
    };
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

  const rows = await prisma.postRecord.findMany({
    where,
    include: { script: SCRIPT_SELECT },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return ok({
    posts: page.map((row) => toPostDto(row, scriptTitleOf(row.script))),
    nextCursor: hasMore && last ? encodePostCursor(last.createdAt, last.id) : null,
  });
});

/** 单条录入。数据全部由用户手动提供，不做任何平台抓取。 */
export const POST = withAuthedRoute(async (request, _context, user) => {
  const input = postInputSchema.parse(await readJson(request));
  const profile = await loadDefaultProfile(user.id);

  const row = await createPost(user.id, profile.id, profile.platform, input);

  return ok({ post: toPostDto(row) }, { status: 201 });
});