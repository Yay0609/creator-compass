import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { importCsvSchema } from "@/lib/posts/schemas";
import { previewImport } from "@/lib/posts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSV 粘贴预览：解析 + 列映射 + 逐行校验 + 疑似重复标记。
 * 本接口绝不写库；用户确认后再调 /api/posts/import/commit。
 */
export const POST = withAuthedRoute(async (request, _context, user) => {
  const input = importCsvSchema.parse(await readJson(request));
  const preview = await previewImport(user.id, input.csv, input.mapping);

  return ok(preview);
});