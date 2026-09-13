import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { toReviewDto } from "@/lib/dto";
import { updateReviewSchema } from "@/lib/reviews/schemas";
import { updateReviewReport } from "@/lib/reviews/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export const GET = withAuthedRoute<Context>(async (_request, { params }, user) => {
  // 查询条件必须带 userId：查不到即当作不存在，不泄露资源归属
  const review = await prisma.reviewReport.findFirst({ where: { id: params.id, userId: user.id } });

  if (!review) {
    throw new ApiError(ErrorCode.NOT_FOUND, "复盘报告不存在");
  }

  return ok({ review: toReviewDto(review) });
});

/** 编辑报告内容 / 收藏 / 忽略。报告不做硬删除，与选题、脚本保持一致。 */
export const PATCH = withAuthedRoute<Context>(async (request, { params }, user) => {
  const input = updateReviewSchema.parse(await readJson(request));
  const row = await updateReviewReport(user.id, params.id, input);

  return ok({ review: toReviewDto(row) });
});