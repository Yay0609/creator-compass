import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "登录" };

/** 只接受站内相对路径，避免开放重定向（//evil.com、/\evil.com 一律拒绝）。 */
function resolveNextPath(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/dashboard";
  }
  return value;
}

export default function LoginPage({ searchParams }: { searchParams: { next?: string | string[] } }) {
  const nextPath = resolveNextPath(searchParams.next);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">登录</h1>
        <p className="text-sm text-muted-foreground">登录后继续你的选题与复盘。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>邮箱密码登录</CardTitle>
          <CardDescription>忘记密码的找回功能尚未开放，请妥善保管密码。</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm nextPath={nextPath} />
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        还没有账号？
        <Link href="/register" className="text-foreground underline">
          去注册
        </Link>
      </p>
    </div>
  );
}