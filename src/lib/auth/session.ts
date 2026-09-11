import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";

import { ApiError } from "@/lib/api/api-error";
import { ErrorCode } from "@/lib/api/error-codes";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";

import {
  SESSION_COOKIE_MAX_AGE_SEC,
  SESSION_COOKIE_NAME,
  SESSION_TOUCH_INTERVAL_MS,
} from "./session-constants";
import { deriveSessionId, generateSessionToken, isSessionExpired, sessionExpiryFrom } from "./token";

export type CurrentUser = {
  id: string;
  email: string;
  nickname: string | null;
  profileCount: number;
};

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

/** 创建会话并把明文 token 返回给调用方（由路由写入 Cookie）。 */
export async function createSession(
  userId: string,
  meta?: { userAgent?: string | null; ip?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const id = deriveSessionId(token, getEnv().SESSION_SECRET);
  const expiresAt = sessionExpiryFrom();

  await prisma.session.create({
    data: {
      id,
      userId,
      expiresAt,
      userAgent: meta?.userAgent ?? null,
      ip: meta?.ip ?? null,
    },
  });

  return { token, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_COOKIE_MAX_AGE_SEC,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** 读取当前登录用户。会话无效 / 过期 / 账号被禁用一律返回 null。 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const id = deriveSessionId(token, getEnv().SESSION_SECRET);

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          nickname: true,
          status: true,
          _count: { select: { profiles: true } },
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (isSessionExpired(session.expiresAt)) {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }

  if (session.user.status !== "active") {
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    await prisma.session.updateMany({ where: { id }, data: { lastSeenAt: new Date() } });
  }

  return {
    id: session.user.id,
    email: session.user.email,
    nickname: session.user.nickname,
    profileCount: session.user._count.profiles,
  };
}

/** 页面守卫：未登录跳登录页。 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** 页面守卫：未建画像跳引导页。 */
export async function requireProfile(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.profileCount === 0) {
    redirect("/onboarding");
  }
  return user;
}

/** API 守卫：未登录抛 401，由 withRoute 统一转成响应体。 */
export async function requireUserForApi(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError(ErrorCode.UNAUTHORIZED);
  }
  return user;
}

/** 删除当前请求对应的会话行（登出）。无会话时返回 null。 */
export async function invalidateCurrentSession(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const id = deriveSessionId(token, getEnv().SESSION_SECRET);
  await prisma.session.deleteMany({ where: { id } });
  return id;
}

export function requestMeta(request: Request): { userAgent: string | null; ip: string | null } {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    userAgent: request.headers.get("user-agent"),
    ip: forwardedFor?.split(",")[0]?.trim() ?? null,
  };
}