import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { profileSchema } from "@/lib/auth/schemas";
import { prisma } from "@/lib/db/prisma";
import { toProfileCreateData, toProfileDto } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuthedRoute(async (_request, _context, user) => {
  const profiles = await prisma.creatorProfile.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return ok({ profiles: profiles.map(toProfileDto) });
});

export const POST = withAuthedRoute(async (request, _context, user) => {
  const input = profileSchema.parse(await readJson(request));

  // P1 约束：每位用户只有一个账号画像。后续支持多账号时放宽这里即可。
  const existing = await prisma.creatorProfile.count({ where: { userId: user.id } });
  if (existing > 0) {
    throw new ApiError(ErrorCode.CONFLICT, "已存在账号画像，请直接编辑");
  }

  const profile = await prisma.creatorProfile.create({
    data: { ...toProfileCreateData(input), userId: user.id },
  });

  return ok({ profile: toProfileDto(profile) }, { status: 201 });
});