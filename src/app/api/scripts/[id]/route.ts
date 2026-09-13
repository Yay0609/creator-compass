import type { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { toScriptDto } from "@/lib/dto";
import { updateScriptSchema } from "@/lib/scripts/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export const GET = withAuthedRoute<Context>(async (_request, { params }, user) => {
  // 查询条件必须带 userId：查不到即当作不存在，不泄露资源归属
  const script = await prisma.script.findFirst({ where: { id: params.id, userId: user.id } });

  if (!script) {
    throw new ApiError(ErrorCode.NOT_FOUND, "脚本不存在");
  }

  return ok({ script: toScriptDto(script) });
});

export const PATCH = withAuthedRoute<Context>(async (request, { params }, user) => {
  const input = updateScriptSchema.parse(await readJson(request));

  const existing = await prisma.script.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });

  if (!existing) {
    throw new ApiError(ErrorCode.NOT_FOUND, "脚本不存在");
  }

  const data: Prisma.ScriptUpdateInput = {};

  if (input.titles !== undefined) data.titles = JSON.stringify(input.titles);
  if (input.hook !== undefined) data.hook = input.hook;
  if (input.tags !== undefined) data.tags = JSON.stringify(input.tags);
  if (input.coverCopy !== undefined) data.coverCopy = input.coverCopy;
  if (input.cta !== undefined) data.cta = input.cta;
  if (input.outline !== undefined) {
    data.outline = JSON.stringify(
      input.outline.map((item) => ({
        section: item.section ?? "",
        seconds: item.seconds ?? 0,
        content: item.content ?? "",
        visual: item.visual ?? "",
      })),
    );
  }
  if (input.isFavorite !== undefined) data.isFavorite = input.isFavorite;
  if (input.isDiscarded !== undefined) data.isDiscarded = input.isDiscarded;

  // 只要动过内容字段，就标记为「人工编辑」（收藏 / 忽略不算）
  const contentEdited =
    input.titles !== undefined ||
    input.hook !== undefined ||
    input.outline !== undefined ||
    input.tags !== undefined ||
    input.coverCopy !== undefined ||
    input.cta !== undefined;

  if (contentEdited) {
    data.source = "edited";
    data.editedAt = new Date();
  }

  const script = await prisma.script.update({ where: { id: existing.id }, data });

  return ok({ script: toScriptDto(script) });
});