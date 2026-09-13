import { AI_DAILY_KIND, type AiFeature } from "@/lib/constants";

export { AI_DAILY_KIND };

/**
 * 配额限额（纯函数，不读 process.env，便于单测注入）。
 * 限额永远是「环境变量」说了算，数据库只存 used，避免 env 调整后出现脏快照。
 */
export type QuotaLimits = {
  AI_DAILY_LIMIT: number;
  QUOTA_TOPIC: number;
  QUOTA_SCRIPT: number;
  QUOTA_REVIEW: number;
};

export function monthlyLimitFor(kind: AiFeature, limits: QuotaLimits): number {
  switch (kind) {
    case "topic":
      return limits.QUOTA_TOPIC;
    case "script":
      return limits.QUOTA_SCRIPT;
    case "review":
      return limits.QUOTA_REVIEW;
  }
}

export function dailyLimitFor(limits: QuotaLimits): number {
  return limits.AI_DAILY_LIMIT;
}

export function featureLabel(kind: AiFeature): string {
  switch (kind) {
    case "topic":
      return "选题";
    case "script":
      return "脚本";
    case "review":
      return "复盘";
  }
}
