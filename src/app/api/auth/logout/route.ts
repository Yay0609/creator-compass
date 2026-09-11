import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { clearSessionCookie, invalidateCurrentSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 幂等：未登录时也返回成功并清除 Cookie。 */
export const POST = withRoute(async () => {
  await invalidateCurrentSession();

  const response = ok({ loggedOut: true });
  clearSessionCookie(response);
  return response;
});