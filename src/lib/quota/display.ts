import { AI_DAILY_KIND } from "@/lib/constants";

/**
 * 配额展示辅助（纯函数，客户端与服务端都可用）。
 *
 * 周期字符串由服务端按 Asia/Shanghai 生成：
 * - 月额度（kind = topic / script / review）：period 形如 "2026-09"
 * - 每日防刷（kind = ai_daily）：period 形如 "2026-09-13"
 *
 * 这里只按周期字符串推导「下一次重置」的展示文案，不引入时区库，
 * 也不改动 P2-P4 已冻结的 QuotaSnapshot 契约。
 */

function isDigits(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  for (const char of value) {
    if (char < "0" || char > "9") {
      return false;
    }
  }
  return true;
}

function isMonthPeriod(period: string): boolean {
  return (
    period.length === 7 &&
    period.charAt(4) === "-" &&
    isDigits(period.slice(0, 4)) &&
    isDigits(period.slice(5))
  );
}

function isDayPeriod(period: string): boolean {
  return (
    period.length === 10 &&
    period.charAt(4) === "-" &&
    period.charAt(7) === "-" &&
    isDigits(period.slice(0, 4)) &&
    isDigits(period.slice(5, 7)) &&
    isDigits(period.slice(8))
  );
}

function pad2(value: number): string {
  return value < 10 ? "0" + String(value) : String(value);
}

/**
 * 下一次重置时间的展示文案；无法识别周期时返回空字符串，由调用方兜底。
 * 例：月额度 "2026-09" -> "2026-10-01 00:00（北京时间）"
 */
export function quotaResetLabel(period: string, kind: string): string {
  if (kind === AI_DAILY_KIND) {
    return isDayPeriod(period) ? "明天 00:00（北京时间）" : "";
  }

  if (!isMonthPeriod(period)) {
    return "";
  }

  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return "";
  }

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return String(nextYear) + "-" + pad2(nextMonth) + "-01 00:00（北京时间）";
}

/** 额度名称，用于提示文案。 */
export function quotaKindLabel(kind: string): string {
  if (kind === "topic") {
    return "选题";
  }
  if (kind === "script") {
    return "脚本";
  }
  if (kind === "review") {
    return "复盘";
  }
  return "AI 调用";
}
