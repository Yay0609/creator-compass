import { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { hashPassword } from "@/lib/auth/password";
import { registerSchema } from "@/lib/auth/schemas";
import { createSession, requestMeta, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { toPublicUser } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (request) => {
  const input = registerSchema.parse(await readJson(request));
  const nickname = input.nickname?.trim();

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw new ApiError(ErrorCode.CONFLICT, "该邮箱已注册，请直接登录");
  }

  const passwordHash = await hashPassword(input.password);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        nickname: nickname ? nickname : null,
      },
    });
  } catch (error) {
    // 并发注册同一邮箱时兜底
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(ErrorCode.CONFLICT, "该邮箱已注册，请直接登录");
    }
    throw error;
  }

  const { token, expiresAt } = await createSession(user.id, requestMeta(request));

  const response = ok({ user: toPublicUser(user) }, { status: 201 });
  setSessionCookie(response, token, expiresAt);
  return response;
});