"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">页面出错了</h1>
      <p className="text-sm text-muted-foreground">{error.message || "渲染过程中发生未知错误。"}</p>
      <Button onClick={reset}>重试</Button>
    </div>
  );
}