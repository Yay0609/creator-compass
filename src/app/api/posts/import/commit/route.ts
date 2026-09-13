import { ok } from "@/lib/api/response";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { toPostDto } from "@/lib/dto";
import { prisma } from "@/lib/db/prisma";
import { commitImportSchema } from "@/lib/posts/schemas";
import { commitImport, loadDefaultProfile, scriptTitleOf } from "@/lib/posts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSV 批量落库：整体事务，任一行不合法则整批回滚（行号由 withRoute 统一转成错误详情）。
 * 重复行不会被自动跳过：用户在预览页自己决定要不要继续提交。
 */
export const POST = withAuthedRoute(async (request, _context, user) => {
  const input = commitImportSchema.parse(await readJson(request));
  const profile = await loadDefaultProfile(user.id);

  const created = await commitImport(user.id, profile.id, profile.platform, input.rows);

  const rows = await prisma.postRecord.findMany({
    where: { userId: user.id, source: "csv" },
    include: { script: { select: { titles: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: created,
  });

  return ok(
    {
      created,
      posts: rows.map((row) => toPostDto(row, scriptTitleOf(row.script))),
    },
    { status: 201 },
  );
});