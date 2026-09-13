import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "error" | "warning" | "info";

const TONE_CLASS: Record<Tone, string> = {
  error: "border-destructive/40 bg-destructive/5 text-destructive",
  warning: "border-amber-500/40 bg-amber-500/5 text-amber-700",
  info: "border-border bg-muted/40 text-muted-foreground",
};

/**
 * 内联提示条：统一表单错误与接口错误的呈现。
 * 默认 role=alert，内容出现时屏幕阅读器会立即播报（P5 无障碍基线）。
 */
export function InlineAlert({
  tone = "error",
  live = true,
  className,
  children,
}: {
  tone?: Tone;
  live?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      role={live ? "alert" : undefined}
      className={cn("rounded-md border px-3 py-2 text-sm", TONE_CLASS[tone], className)}
    >
      {children}
    </p>
  );
}
