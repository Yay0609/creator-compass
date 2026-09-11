"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DELETE_ACCOUNT_CONFIRM_TEXT } from "@/lib/auth/schemas";
import { apiRequest } from "@/lib/client/api";

export function DangerZone({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    setError(null);

    const result = await apiRequest("/api/account", {
      method: "DELETE",
      body: JSON.stringify({ password, confirm }),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>数据与账号</CardTitle>
        <CardDescription>导出你的数据，或永久删除账号（不可恢复）。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">导出我的数据</p>
            <p className="text-xs text-muted-foreground">下载 JSON 文件，包含账号信息与画像，不含密码。</p>
          </div>
          <a href="/api/account/export" className={buttonVariants({ variant: "outline" })}>
            下载
          </a>
        </div>

        <div className="space-y-3 rounded-md border border-destructive/40 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">注销账号</p>
            <p className="text-xs text-muted-foreground">
              将永久删除账号 {email} 及其全部画像与会话记录，无法恢复。
            </p>
          </div>

          {open ? (
            <div className="space-y-3">
              <Field label="当前密码" htmlFor="delete-password">
                <Input
                  id="delete-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>

              <Field
                label={`输入「${DELETE_ACCOUNT_CONFIRM_TEXT}」以确认`}
                htmlFor="delete-confirm"
              >
                <Input
                  id="delete-confirm"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder={DELETE_ACCOUNT_CONFIRM_TEXT}
                />
              </Field>

              {error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" type="button" disabled={pending} onClick={handleDelete}>
                  {pending ? "注销中…" : "确认注销"}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" type="button" onClick={() => setOpen(true)}>
              我要注销账号
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}