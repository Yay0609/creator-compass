import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/auth/schemas";
import { createSession, requestMeta, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { toPublicUser } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let dummyHashPromise: Promise<string> | null = null;

/** 账号不存在时也做一次 bcrypt 比对，避免通过响应耗时判断邮箱是否已注册。 */
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("__creator_compass_nonexistent__");
  return dummyHashPromise;
}

export const POST = withRoute(async (request) => {
  const input = loginSchema.parse(await readJson(request));

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !passwordOk) {
    throw new ApiError(ErrorCode.UNAUTHORIZED, "邮箱或密码错误");
  }

  if (user.status !== "active") {
    throw new ApiError(ErrorCode.FORBIDDEN, "账号已被禁用，请联系支持");
  }

  // 顺手清理该用户已过期的会话，避免表无限增长
  await prisma.session.deleteMany({
    where: { userId: user.id, expiresAt: { lt: new Date() } },
  });

  const { token, expiresAt } = await createSession(user.id, requestMeta(request));
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const response = ok({ user: toPublicUser(updated) });
  setSessionCookie(response, token, expiresAt);
  return response;
});