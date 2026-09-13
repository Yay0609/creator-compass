import { z } from "zod";

/**
 * 降级草稿的通用字段构造器（选题 / 脚本共用）。
 * 原则：宽进严出——尽量保留模型给到的内容，缺失或不合法的一律降级为空值，
 * 由用户在编辑界面上补全后再保存。
 */

/** 文本字段：截断到 max 字；数字 / 布尔转为字符串；其余一律空串。 */
export function draftText(max: number) {
  return z.preprocess((value) => {
    if (typeof value === "string") {
      return value.trim().slice(0, max);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return "";
  }, z.string());
}

/** 字符串数组字段：去掉空项并截断到 maxItems 个。 */
export function draftStringArray(itemMax: number, maxItems: number) {
  return z.preprocess((value) => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (typeof item === "string") {
          return item.trim().slice(0, itemMax);
        }
        if (typeof item === "number") {
          return String(item);
        }
        return "";
      })
      .filter((item) => item.length > 0)
      .slice(0, maxItems);
  }, z.array(z.string()));
}

/** 数组字段：非数组一律降级为空数组，并截断到 maxItems 个。 */
export function draftArray<T extends z.ZodTypeAny>(item: T, maxItems: number) {
  return z.preprocess(
    (value) => (Array.isArray(value) ? value.slice(0, maxItems) : []),
    z.array(item),
  );
}

/** 整数或 null：非数字一律 null，越界钳制到 [min, max]。 */
export function draftInt(min: number, max: number) {
  return z.preprocess(
    (value) => {
      const numeric =
        typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
      if (!Number.isFinite(numeric)) {
        return null;
      }
      return Math.min(max, Math.max(min, Math.round(numeric)));
    },
    z.number().int().nullable(),
  );
}

/** 整数（带默认值）：非数字回落到 defaultValue，越界钳制到 [min, max]。 */
export function draftNumber(defaultValue: number, min: number, max: number) {
  return z.preprocess(
    (value) => {
      const numeric =
        typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
      if (!Number.isFinite(numeric)) {
        return defaultValue;
      }
      return Math.min(max, Math.max(min, Math.round(numeric)));
    },
    z.number().int(),
  );
}