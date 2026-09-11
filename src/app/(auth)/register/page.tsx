import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "注册" };

export default function RegisterPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">注册</h1>
        <p className="text-sm text-muted-foreground">注册后先填写账号画像，再开始生成选题。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>创建账号</CardTitle>
          <CardDescription>只需要邮箱和密码，不采集任何平台账号信息。</CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm />
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