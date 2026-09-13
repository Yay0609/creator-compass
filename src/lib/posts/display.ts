/**
 * 作品数据的展示格式化（纯函数，客户端可安全使用）。
 * 数字统一用千分位、比率统一转百分比，保证列表与报告口径一致。
 */

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return value.toLocaleString("zh-CN");
}

export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

/** ISO 字符串 -> 北京时间日期（YYYY-MM-DD）。 */
export function formatShanghaiDate(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** ISO 字符串 -> 北京时间日期时间（用于详情页）。 */
export function formatShanghaiDateTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}