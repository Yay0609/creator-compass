import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "注册" };

export default function RegisterPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">注册</h1>
          <Badge variant="secondary">P1 实现</Badge>
        </div>
        <p className="text-sm text-muted-foreground">P0 占位页面，表单暂不可用。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>创建账号</CardTitle>
          <CardDescription>注册后需要先填写账号画像，才能开始生成选题。</CardDescription>
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
              注册（P1 开放）
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        已有账号？
        <Link href="/login" className="text-foreground underline">
          去登录
        </Link>
      </p>
    </div>
  );
}