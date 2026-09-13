import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 统一错误态（P5 起全站共用）：用于「整块内容加载失败」。
 * 与 InlineAlert 的分工：这是页面/区块级失败，InlineAlert 是表单与单次操作的失败。
 */
export function ErrorState({
  title = "加载失败",
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center", className)}
    >
      <p className="text-sm font-medium text-destructive">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
