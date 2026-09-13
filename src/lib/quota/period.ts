/**
 * 配额周期计算（纯函数）。
 * 统一按 Asia/Shanghai 划分周期：中国创作者的「今天」以北京时间 0 点为界，
 * 而不是服务器所在的 UTC。
 */

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 把任意时刻平移到「上海时区视角」，再用 UTC getter 读取年月日。 */
function toShanghai(date: Date): Date {
  return new Date(date.getTime() + SHANGHAI_OFFSET_MS);
}

/** 月周期：YYYY-MM */
export function monthPeriod(date: Date = new Date()): string {
  const local = toShanghai(date);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}`;
}

/** 日周期：YYYY-MM-DD */
export function dayPeriod(date: Date = new Date()): string {
  const local = toShanghai(date);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`;
}
