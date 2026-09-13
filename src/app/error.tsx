"use client";

import { Button } from "@/components/ui/button";

/**
 * 应用级错误边界（P5 起）：只展示通用文案与错误编号 digest，
 * 不把 error.message 渲染给用户，避免泄漏服务端实现细节。
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-muted-foreground">出错了</p>
      <h1 className="text-2xl font-semibold">页面暂时无法显示</h1>
      <p className="text-sm text-muted-foreground">
        请先重试一次；如果反复出现，把下面的错误编号发给我们，排查会快很多。
      </p>
      {error.digest ? <p className="text-xs text-muted-foreground">错误编号：{error.digest}</p> : null}
      <Button onClick={reset}>重试</Button>
    </div>
  );
}
