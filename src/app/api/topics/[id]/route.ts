import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { toTopicDto } from "@/lib/dto";
import { updateTopicSchema } from "@/lib/topics/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export const GET = withAuthedRoute<Context>(async (_request, { params }, user) => {
  // 查询条件必须带 userId：查不到即当作不存在，不泄露资源归属
  const topic = await prisma.topicIdea.findFirst({ where: { id: params.id, userId: user.id } });

  if (!topic) {
    throw new ApiError(ErrorCode.NOT_FOUND, "选题不存在");
  }

  return ok({ topic: toTopicDto(topic) });
});

export const PATCH = withAuthedRoute<Context>(async (request, { params }, user) => {
  const input = updateTopicSchema.parse(await readJson(request));

  const existing = await prisma.topicIdea.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });

  if (!existing) {
    throw new ApiError(ErrorCode.NOT_FOUND, "选题不存在");
  }

  const topic = await prisma.topicIdea.update({
    where: { id: existing.id },
    data: {
      ...(input.isFavorite === undefined ? {} : { isFavorite: input.isFavorite }),
      ...(input.isDiscarded === undefined ? {} : { isDiscarded: input.isDiscarded }),
    },
  });

  return ok({ topic: toTopicDto(topic) });
});
