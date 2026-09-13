import type { QuotaSnapshot, UsageSummary } from "@/lib/topics/schemas";
import { cn } from "@/lib/utils";

/** 用量条：纯展示组件，可在服务端组件里直接渲染。 */
export function QuotaMeter({ usage, className }: { usage: UsageSummary; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      <MeterItem label="本月选题" snapshot={usage.month.topic} />
      <MeterItem label="本月脚本" snapshot={usage.month.script} />
      <MeterItem label="本月复盘" snapshot={usage.month.review} />
      <MeterItem
        label="今日 AI 调用"
        snapshot={usage.day.aiDaily}
        hint={`统计周期 ${usage.day.period}（北京时间）`}
      />
    </div>
  );
}

function MeterItem({
  label,
  snapshot,
  hint,
}: {
  label: string;
  snapshot: QuotaSnapshot;
  hint?: string;
}) {
  const ratio = snapshot.limit > 0 ? Math.min(1, snapshot.used / snapshot.limit) : 0;
  const exhausted = snapshot.used >= snapshot.limit;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={cn(
            "text-xs tabular-nums",
            exhausted ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {snapshot.used} / {snapshot.limit}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            exhausted ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
