import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { profileSchema } from "@/lib/auth/schemas";
import { prisma } from "@/lib/db/prisma";
import { toProfileDto, toProfileUpdateData } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export const PATCH = withAuthedRoute<Context>(async (request, { params }, user) => {
  const input = profileSchema.partial().parse(await readJson(request));

  // 查询条件必须带 userId：查不到即视为不存在，不泄露资源是否属于他人
  const existing = await prisma.creatorProfile.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });
  if (!existing) {
    throw new ApiError(ErrorCode.NOT_FOUND, "账号画像不存在");
  }

  const profile = await prisma.creatorProfile.update({
    where: { id: existing.id },
    data: toProfileUpdateData(input),
  });

  return ok({ profile: toProfileDto(profile) });
});

export const DELETE = withAuthedRoute<Context>(async (_request, { params }, user) => {
  const existing = await prisma.creatorProfile.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });
  if (!existing) {
    throw new ApiError(ErrorCode.NOT_FOUND, "账号画像不存在");
  }

  const total = await prisma.creatorProfile.count({ where: { userId: user.id } });
  if (total <= 1) {
    throw new ApiError(ErrorCode.BAD_REQUEST, "至少需要保留一个账号画像");
  }

  await prisma.creatorProfile.delete({ where: { id: existing.id } });

  return ok({ deleted: true });
});