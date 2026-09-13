import { cn } from "@/lib/utils";

/**
 * 手写条形图（纯 CSS，不引入图表库）：用于对比本次作品与账号基线。
 * 宽度按最大值归一化，最小值也会保留 2% 宽度，避免「数值很小但看起来是 0」。
 */

export type MiniBarItem = {
  label: string;
  value: number | null;
  /** 基线类参考值：用次要色区分，并加虚线边框 */
  variant?: "primary" | "muted";
  /** 条右侧的自定义文案（默认用 formatter 格式化数值） */
  display?: string;
};

export function MiniBarChart({
  items,
  title,
  hint,
  formatter,
  className,
}: {
  items: MiniBarItem[];
  title?: string;
  hint?: string;
  formatter?: (value: number) => string;
  className?: string;
}) {
  const values = items
    .map((item) => item.value)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const max = values.length > 0 ? Math.max(...values) : 0;

  const format = (value: number): string =>
    formatter ? formatter(value) : value.toLocaleString("zh-CN");

  return (
    <div className={cn("space-y-2", className)}>
      {title ? <p className="text-sm font-medium">{title}</p> : null}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无可对比的数据</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const ratio =
              item.value === null || max <= 0
                ? 0
                : Math.max(0.02, Math.min(1, item.value / max));

            return (
              <li key={item.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate" title={item.label}>
                    {item.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {item.display ?? (item.value === null ? "—" : format(item.value))}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      item.variant === "muted" ? "bg-muted-foreground/40" : "bg-primary",
                    )}
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}