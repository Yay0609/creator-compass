import { NextResponse } from "next/server";

import { withAuthedRoute } from "@/lib/api/handler";
import { prisma } from "@/lib/db/prisma";
import { toProfileDto } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 导出当前账号的数据（JSON 下载）。
 * 明确排除 passwordHash 与会话数据；schemaVersion 便于后续阶段扩展导出结构。
 */
export const GET = withAuthedRoute(async (_request, _context, user) => {
  const [account, profiles] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        nickname: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
    prisma.creatorProfile.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    user: account,
    profiles: profiles.map(toProfileDto),
  };

  const filename = `creator-compass-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});