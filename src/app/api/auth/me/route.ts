import { withAuthedRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { toProfileDto } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuthedRoute(async (_request, _context, user) => {
  const profiles = await prisma.creatorProfile.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return ok({
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      profileCount: user.profileCount,
    },
    profiles: profiles.map(toProfileDto),
  });
});