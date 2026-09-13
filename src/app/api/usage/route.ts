import { withAuthedRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { readUsage } from "@/lib/quota/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 当前用量（月额度 + 日防刷额度），供页面用量条展示。 */
export const GET = withAuthedRoute(async (_request, _context, user) => {
  return ok({ usage: await readUsage(user.id) });
});
