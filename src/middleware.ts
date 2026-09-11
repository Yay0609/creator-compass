import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/session-constants";

/**
 * 粗粒度路由守卫：只判断会话 Cookie 是否存在。
 *
 * 这不是安全边界：
 * - 运行在 edge runtime，无法访问 Prisma，因此无法校验会话是否真实有效
 * - 真正的鉴权在 (app)/layout.tsx 等 Server Component（requireUser）与
 *   API 路由（withAuthedRoute / requireUserForApi）中完成
 * 它的作用只是让未登录用户在抵达页面前就被重定向，减少无谓渲染。
 */
export function middleware(request: NextRequest): NextResponse {
  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/topics/:path*",
    "/scripts/:path*",
    "/posts/:path*",
    "/reviews/:path*",
    "/settings/:path*",
  ],
};