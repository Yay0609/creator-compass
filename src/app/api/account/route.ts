import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { withAuthedRoute } from "@/lib/api/handler";
import { readJson } from "@/lib/api/request";
import { ok } from "@/lib/api/response";
import { verifyPassword } from "@/lib/auth/password";
import { deleteAccountSchema } from "@/lib/auth/schemas";
import { clearSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 注销账号：校验密码 + 确认文案，物理删除用户，会话与画像级联删除。 */
export const DELETE = withAuthedRoute(async (request, _context, user) => {
  const input = deleteAccountSchema.parse(await readJson(request));

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!record || !(await verifyPassword(input.password, record.passwordHash))) {
    throw new ApiError(ErrorCode.VALIDATION_FAILED, "密码不正确", { field: "password" });
  }

  await prisma.user.delete({ where: { id: user.id } });

  const response = ok({ deleted: true });
  clearSessionCookie(response);
  return response;
});