import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "登录" };

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">登录</h1>
          <Badge variant="secondary">P1 实现</Badge>
        </div>
        <p className="text-sm text-muted-foreground">P0 占位页面，表单暂不可用。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>邮箱密码登录</CardTitle>
          <CardDescription>P1 将接入自建 Session 表 + httpOnly Cookie。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input id="email" type="email" placeholder="you@example.com" disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" placeholder="至少 8 位" disabled />
            </div>
            <Button className="w-full" disabled>
              登录（P1 开放）
            </Button>
          </form>
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