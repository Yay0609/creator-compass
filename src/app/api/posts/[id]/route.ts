import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { toPostDto } from "@/lib/dto";
import { updatePostSchema } from "@/lib/posts/schemas";
import { deletePost, scriptTitleOf, updatePost } from "@/lib/posts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export const GET = withAuthedRoute<Context>(async (_request, { params }, user) => {
  // 查询条件必须带 userId：查不到即当作不存在，不泄露资源归属
  const post = await prisma.postRecord.findFirst({
    where: { id: params.id, userId: user.id },
    include: { script: { select: { titles: true } } },
  });

  if (!post) {
    throw new ApiError(ErrorCode.NOT_FOUND, "作品不存在");
  }

  return ok({ post: toPostDto(post, scriptTitleOf(post.script)) });
});

/** 修正已录入的作品。历史复盘报告凭快照不受影响。 */
export const PATCH = withAuthedRoute<Context>(async (request, { params }, user) => {
  const input = updatePostSchema.parse(await readJson(request));
  const row = await updatePost(user.id, params.id, input);

  return ok({ post: toPostDto(row) });
});

/** 删除作品（前端需二次确认）。复盘报告只引用快照，不依赖本行，故不需要级联处理。 */
export const DELETE = withAuthedRoute<Context>(async (_request, { params }, user) => {
  await deletePost(user.id, params.id);
  return ok({ deleted: true });
});