import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 统一空态（P5 起全站共用）：图标 + 标题 + 说明 + 可选行动区。
 * 各列表页只传文案与按钮，避免措辞和留白各写一套。
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-dashed p-8 text-center", className)}>
      {icon ? <div className="mb-3 flex justify-center text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
