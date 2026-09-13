import { quotaResetLabel } from "@/lib/quota/display";
import type { QuotaSnapshot } from "@/lib/topics/schemas";

/**
 * 额度提示（P5）：生成前告诉用户「这次会消耗什么、还剩多少」，用尽时给出重置时间。
 * 纯展示组件，服务端与客户端组件都可以渲染。
 */
export function QuotaHint({
  label,
  scope,
  snapshot,
}: {
  label: string;
  scope: "month" | "day";
  snapshot: QuotaSnapshot;
}) {
  const remaining = Math.max(0, snapshot.limit - snapshot.used);
  const reset = quotaResetLabel(snapshot.period, snapshot.kind);

  if (remaining > 0) {
    if (scope === "day") {
      return null;
    }
    return (
      <p className="text-xs text-muted-foreground">
        本次生成消耗 1 次{label}额度，本月剩余 {remaining} 次。
      </p>
    );
  }

  return (
    <p className="text-sm text-destructive" role="alert">
      {scope === "day" ? "今日" : "本月"}
      {label}额度已用完（{snapshot.limit} 次）
      {reset.length > 0 ? "，" + reset + "自动恢复" : "，下个周期自动恢复"}。
    </p>
  );
}
