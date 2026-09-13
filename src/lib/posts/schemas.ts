import { z } from "zod";

import {
  POST_COUNT_MAX,
  POST_IMPORT_MAX_CSV_CHARS,
  POST_IMPORT_MAX_ROWS,
  POST_NOTE_MAX,
  POST_PAGE_SIZE_MAX,
  POST_TITLE_MAX,
  PLATFORMS,
} from "@/lib/constants";

import { POST_FIELD_KEYS, parseDateInput, type PostFieldKey } from "./csv";

/**
 * 作品数据模块的共享契约：入参、对外 DTO、游标，以及派生指标与基线计算。
 * 派生指标一律「算出来」而不落库，避免口径调整后出现历史脏数据。
 */

// ---------- 入参 ----------

const countInput = z
  .number()
  .int("必须是整数")
  .min(0, "不能为负数")
  .max(POST_COUNT_MAX, "数值过大，请检查是否填错")
  .nullable()
  .optional();

const rateInput = z
  .number()
  .min(0, "比率不能小于 0")
  .max(1, "比率不能大于 1")
  .nullable()
  .optional();

export const postInputSchema = z
  .object({
    scriptId: z.string().trim().min(1).optional(),
    platform: z.enum(PLATFORMS.map((item) => item.value) as [string, ...string[]]).optional(),
    title: z.string().trim().min(1, "标题不能为空").max(POST_TITLE_MAX, `标题最多 ${POST_TITLE_MAX} 字`),
    /** 支持 YYYY-MM-DD、YYYY/M/D、M/D（缺年份补当年），也接受完整 ISO 时间 */
    publishedAt: z
      .string()
      .trim()
      .min(1, "请填写发布时间")
      .refine((value) => parseDateInput(value) !== null, "发布时间格式无法识别"),
    impressions: countInput,
    views: countInput,
    likes: countInput,
    comments: countInput,
    saves: countInput,
    shares: countInput,
    followsGained: countInput,
    /** 完播率，统一归一化到 0–1 */
    completionRate: rateInput,
    note: z.string().trim().max(POST_NOTE_MAX, `备注最多 ${POST_NOTE_MAX} 字`).optional(),
  })
  .strict();

export type PostInput = z.infer<typeof postInputSchema>;

/** 修正已有作品：所有字段可选，但至少要提供一个。 */
export const updatePostSchema = postInputSchema
  .partial()
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "至少提供一个要更新的字段",
  });

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

/** CSV 预览入参：解析 + 校验，但不写库。mapping 为「列下标 -> 字段」的完整映射。 */
export const importCsvSchema = z
  .object({
    csv: z
      .string()
      .min(1, "请先粘贴 CSV 内容")
      .max(POST_IMPORT_MAX_CSV_CHARS, `粘贴内容最多 ${POST_IMPORT_MAX_CSV_CHARS} 字符`),
    mapping: z.record(z.string(), z.enum(POST_FIELD_KEYS)).optional(),
  })
  .strict();

export type ImportCsvInput = z.infer<typeof importCsvSchema>;

/** 供前端复用的字段枚举。 */
export const POST_FIELD_KEYS_FOR_CLIENT: readonly PostFieldKey[] = POST_FIELD_KEYS;

/** CSV 批量落库：整体事务，任一行不合法就整批拒绝（并回传行号）。 */
export const commitImportSchema = z
  .object({
    rows: z
      .array(postInputSchema)
      .min(1, "至少导入 1 行")
      .max(POST_IMPORT_MAX_ROWS, `一次最多导入 ${POST_IMPORT_MAX_ROWS} 行`),
    source: z.literal("csv").optional(),
  })
  .strict();

export type CommitImportInput = z.infer<typeof commitImportSchema>;

export const listPostsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(POST_PAGE_SIZE_MAX).optional(),
  cursor: z.string().trim().min(1).optional(),
  platform: z.string().trim().min(1).optional(),
  scriptId: z.string().trim().min(1).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
});

// ---------- 派生指标 ----------

export const postMetricsSchema = z.object({
  /** 点赞 / 播放 */
  likeRate: z.number().nullable(),
  commentRate: z.number().nullable(),
  /** 收藏 / 播放 */
  saveRate: z.number().nullable(),
  shareRate: z.number().nullable(),
  /** （点赞 + 评论 + 收藏 + 分享）/ 播放 */
  interactionRate: z.number().nullable(),
  /** 涨粉 / 播放 */
  followRate: z.number().nullable(),
  /** 播放 / 曝光 */
  playRate: z.number().nullable(),
});

export type PostMetrics = z.infer<typeof postMetricsSchema>;

export type PostMetricSource = {
  views: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  followsGained: number | null;
};

/** 比率统一保留 4 位小数（0.0523 = 5.23%）；分母缺失或为 0 时返回 null。 */
function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function sumOrNull(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  return present.reduce((total, value) => total + value, 0);
}

export function computePostMetrics(post: PostMetricSource): PostMetrics {
  const interactions = sumOrNull([post.likes, post.comments, post.saves, post.shares]);

  return {
    likeRate: ratio(post.likes, post.views),
    commentRate: ratio(post.comments, post.views),
    saveRate: ratio(post.saves, post.views),
    shareRate: ratio(post.shares, post.views),
    interactionRate: ratio(interactions, post.views),
    followRate: ratio(post.followsGained, post.views),
    playRate: ratio(post.views, post.impressions),
  };
}

// ---------- 对外 DTO ----------

export const postDtoSchema = z.object({
  id: z.string(),
  scriptId: z.string().nullable(),
  /** 关联脚本的标题快照；未关联时为 null */
  scriptTitle: z.string().nullable(),
  platform: z.string(),
  title: z.string(),
  publishedAt: z.string(),
  impressions: z.number().nullable(),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  saves: z.number().nullable(),
  shares: z.number().nullable(),
  followsGained: z.number().nullable(),
  completionRate: z.number().nullable(),
  note: z.string(),
  source: z.string(),
  metrics: postMetricsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PostDto = z.infer<typeof postDtoSchema>;

// ---------- 基线 ----------

export const baselineMetricSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: z.enum(["count", "rate"]),
  sampleSize: z.number().int(),
  mean: z.number().nullable(),
  median: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
});

export type BaselineMetric = z.infer<typeof baselineMetricSchema>;

export const baselineSchema = z.object({
  sampleSize: z.number().int(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  metrics: z.array(baselineMetricSchema),
});

export type Baseline = z.infer<typeof baselineSchema>;

export type BaselineSource = PostMetricSource & {
  completionRate: number | null;
  publishedAt: Date;
};

type BaselineMetricSpec = {
  key: string;
  label: string;
  unit: "count" | "rate";
  pick: (post: BaselineSource) => number | null;
};

const BASELINE_SPECS: BaselineMetricSpec[] = [
  { key: "views", label: "播放/阅读", unit: "count", pick: (post) => post.views },
  { key: "impressions", label: "曝光/展现", unit: "count", pick: (post) => post.impressions },
  { key: "likes", label: "点赞", unit: "count", pick: (post) => post.likes },
  { key: "comments", label: "评论", unit: "count", pick: (post) => post.comments },
  { key: "saves", label: "收藏", unit: "count", pick: (post) => post.saves },
  { key: "shares", label: "分享", unit: "count", pick: (post) => post.shares },
  { key: "followsGained", label: "涨粉", unit: "count", pick: (post) => post.followsGained },
  { key: "completionRate", label: "完播率", unit: "rate", pick: (post) => post.completionRate },
  {
    key: "interactionRate",
    label: "互动率",
    unit: "rate",
    pick: (post) => computePostMetrics(post).interactionRate,
  },
];
function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function medianOf(sorted: number[]): number | null {
  if (sorted.length === 0) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }

  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (left === undefined || right === undefined) {
    return null;
  }
  return (left + right) / 2;
}

/**
 * 基线统计：对「同账号历史作品」逐指标算均值 / 中位数 / 区间。
 * 样本量会一并回传，报告里必须标注，避免小样本被过度解读。
 */
export function computeBaseline(posts: BaselineSource[]): Baseline {
  const metrics: BaselineMetric[] = BASELINE_SPECS.map((spec) => {
    const values = posts
      .map((post) => spec.pick(post))
      .filter((value): value is number => value !== null && Number.isFinite(value))
      .sort((left, right) => left - right);

    if (values.length === 0) {
      return {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        sampleSize: 0,
        mean: null,
        median: null,
        min: null,
        max: null,
      };
    }

    const total = values.reduce((sum, value) => sum + value, 0);
    const digits = spec.unit === "rate" ? 4 : 2;
    const median = medianOf(values);

    return {
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      sampleSize: values.length,
      mean: roundTo(total / values.length, digits),
      median: median === null ? null : roundTo(median, digits),
      min: values[0] ?? null,
      max: values[values.length - 1] ?? null,
    };
  });

  const timestamps = posts
    .map((post) => post.publishedAt)
    .filter((value) => !Number.isNaN(value.getTime()))
    .map((value) => value.getTime())
    .sort((left, right) => left - right);

  return {
    sampleSize: posts.length,
    periodStart: timestamps.length > 0 ? new Date(timestamps[0] as number).toISOString() : null,
    periodEnd:
      timestamps.length > 0
        ? new Date(timestamps[timestamps.length - 1] as number).toISOString()
        : null,
    metrics,
  };
}

/** 从基线里取某个指标的均值 / 中位数，用于报告卡片上的快捷展示。 */
export function baselineMetric(baseline: Baseline, key: string): BaselineMetric | null {
  return baseline.metrics.find((metric) => metric.key === key) ?? null;
}

// ---------- 游标 ----------
// 形式：encodeURIComponent("<createdAt ISO>|<id>")，对客户端不透明；作品与复盘共用一套实现。

export function encodeCursor(createdAt: Date | string, id: string): string {
  const iso = typeof createdAt === "string" ? createdAt : createdAt.toISOString();
  return encodeURIComponent(`${iso}|${id}`);
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  let raw: string;
  try {
    raw = decodeURIComponent(cursor);
  } catch {
    return null;
  }

  const separator = raw.lastIndexOf("|");
  if (separator <= 0) {
    return null;
  }

  const iso = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  const createdAt = new Date(iso);

  if (Number.isNaN(createdAt.getTime()) || iso.length === 0 || id.length === 0) {
    return null;
  }

  return { createdAt, id };
}

export function encodePostCursor(createdAt: Date | string, id: string): string {
  return encodeCursor(createdAt, id);
}

export function decodePostCursor(cursor: string): { createdAt: Date; id: string } | null {
  return decodeCursor(cursor);
}