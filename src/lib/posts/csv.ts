import type { PostInput } from "./schemas";

import { POST_COUNT_MAX, POST_NOTE_MAX, POST_TITLE_MAX, PLATFORMS } from "@/lib/constants";

/**
 * 作品数据 CSV 解析（纯函数，无 IO，便于单测）。
 *
 * 设计取舍：
 * - 手写 RFC4180 解析，不引入 papaparse：需求简单（粘贴一小段表格），依赖越少越好
 * - 列识别靠「表头别名 + 手动改映射」，未识别列一律忽略并列进 unmatched，不猜
 * - 数值 / 百分比 / 日期统一归一化后再落库，避免 "1.2万"、"35%" 这类脏数据入库
 */

// ---------- 字段与别名 ----------

export const POST_FIELD_KEYS = [
  "title",
  "publishedAt",
  "platform",
  "impressions",
  "views",
  "likes",
  "comments",
  "saves",
  "shares",
  "followsGained",
  "completionRate",
  "note",
] as const;

export type PostFieldKey = (typeof POST_FIELD_KEYS)[number];

export const POST_FIELD_LABELS: Record<PostFieldKey, string> = {
  title: "标题",
  publishedAt: "发布时间",
  platform: "平台",
  impressions: "曝光/展现",
  views: "播放/阅读",
  likes: "点赞",
  comments: "评论",
  saves: "收藏",
  shares: "分享",
  followsGained: "涨粉",
  completionRate: "完播率",
  note: "备注",
};

/** 必填字段：缺失时整列标红，导入无法提交。 */
export const POST_REQUIRED_FIELDS: PostFieldKey[] = ["title", "publishedAt"];

/** 内置表头别名。匹配前会先做「去空格 / 去括号 / 转小写」归一化。 */
export const POST_FIELD_ALIASES: Record<PostFieldKey, string[]> = {
  title: ["标题", "作品标题", "笔记标题", "视频标题", "内容标题", "作品", "笔记", "title"],
  publishedAt: [
    "发布时间",
    "发布日期",
    "发布日",
    "时间",
    "日期",
    "发布",
    "publishedat",
    "date",
  ],
  platform: ["平台", "渠道", "platform"],
  impressions: ["曝光", "展现", "曝光量", "展现量", "曝光数", "展现数", "impressions"],
  views: ["播放", "阅读", "播放量", "阅读量", "播放数", "阅读数", "浏览量", "views", "play"],
  likes: ["点赞", "赞", "点赞数", "点赞量", "likes", "like"],
  comments: ["评论", "评论数", "评论量", "comments", "comment"],
  saves: ["收藏", "收藏数", "收藏量", "saves", "save", "favorites"],
  shares: ["分享", "转发", "分享数", "转发数", "shares", "share"],
  followsGained: ["涨粉", "新增粉丝", "涨粉数", "粉丝增长", "新增关注", "follows", "follows gained"],
  completionRate: ["完播率", "完播", "完播比", "completionrate", "completion rate"],
  note: ["备注", "说明", "note", "remark"],
};

/** 表头归一化：去掉空格 / 括号 / 全角符号并转小写，提高别名命中率。 */
function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]/g, "")
    .replace(/[（(].*?[)）]/g, "")
    .replace(/[·:：]/g, "");
}

// ---------- RFC4180 解析 ----------

/** 探测分隔符：从 Excel 直接粘贴过来是制表符，从表格导出一般是逗号。 */
function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

/**
 * 解析 CSV / TSV 文本为二维数组。
 * 支持引号包裹、引号转义（""）、字段内换行，兼容 CRLF。
 */
export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const sep = delimiter ?? detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index] as string;

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === sep) {
      row.push(field);
      field = "";
      index += 1;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 丢弃完全空白的行（例如末尾多敲的回车）
  return rows.filter((item) => item.some((cell) => cell.trim().length > 0));
}

/** 自动识别表头 -> 字段。同名列只取第一次出现。 */
export function autoMapColumns(header: string[]): Record<string, PostFieldKey> {
  const mapping: Record<string, PostFieldKey> = {};
  const used = new Set<PostFieldKey>();

  header.forEach((raw, columnIndex) => {
    const normalized = normalizeHeader(raw);
    if (normalized.length === 0) {
      return;
    }

    for (const field of POST_FIELD_KEYS) {
      if (used.has(field)) {
        continue;
      }
      const aliases = POST_FIELD_ALIASES[field];
      if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
        mapping[String(columnIndex)] = field;
        used.add(field);
        return;
      }
    }
  });

  return mapping;
}

/** 未识别的列名（用于预览页提示「这些列会被忽略」）。 */
export function unmatchedColumns(
  header: string[],
  mapping: Record<string, PostFieldKey>,
): string[] {
  return header.filter((name, columnIndex) => mapping[String(columnIndex)] === undefined && name.trim().length > 0);
}

export function missingRequiredFields(mapping: Record<string, PostFieldKey>): PostFieldKey[] {
  const mapped = new Set(Object.values(mapping));
  return POST_REQUIRED_FIELDS.filter((field) => !mapped.has(field));
}
// ---------- 单元格归一化 ----------

export type NormalizeResult<T> = { ok: true; value: T } | { ok: false; error: string };

const BLANK_TOKENS = new Set(["-", "--", "—", "–", "/", "无", "暂无", "n/a", "na", "null", "none"]);

function isBlank(raw: string): boolean {
  const text = raw.trim();
  return text.length === 0 || BLANK_TOKENS.has(text.toLowerCase());
}

const UNIT_FACTORS: Record<string, number> = {
  万: 10_000,
  w: 10_000,
  k: 1_000,
  千: 1_000,
  亿: 100_000_000,
};

/** 计数类数值：支持 "1,234"、"1.2万"、"12k"；空值返回 null，非法值返回错误。 */
export function normalizeCount(raw: string): NormalizeResult<number | null> {
  if (isBlank(raw)) {
    return { ok: true, value: null };
  }

  const text = raw.trim().toLowerCase().replace(/[,\s\u3000]/g, "");
  const match = /^(\d+(?:\.\d+)?)(万|w|k|千|亿)?$/.exec(text);

  if (!match) {
    return { ok: false, error: `无法识别的数字：「${raw.trim().slice(0, 20)}」` };
  }

  const numeric = Number(match[1]);
  const factor = match[2] === undefined ? 1 : (UNIT_FACTORS[match[2]] ?? 1);
  const value = Math.round(numeric * factor);

  if (!Number.isFinite(value)) {
    return { ok: false, error: "数值超出可识别范围" };
  }
  if (value > POST_COUNT_MAX) {
    return { ok: false, error: `数值过大（上限 ${POST_COUNT_MAX}）` };
  }

  return { ok: true, value };
}

/**
 * 比率类数值，统一归一化到 0–1：
 * "35%" -> 0.35；"35" -> 0.35；"0.35" -> 0.35；"1" -> 1（视为 100%）。
 */
export function normalizeRate(raw: string): NormalizeResult<number | null> {
  if (isBlank(raw)) {
    return { ok: true, value: null };
  }

  const text = raw.trim().replace(/[,\s\u3000]/g, "");
  const hasPercent = text.endsWith("%");
  const digits = hasPercent ? text.slice(0, -1) : text;

  if (!/^\d+(?:\.\d+)?$/.test(digits)) {
    return { ok: false, error: `无法识别的百分比：「${raw.trim().slice(0, 20)}」` };
  }

  let value = Number(digits);
  if (hasPercent || value > 1) {
    value /= 100;
  }

  if (value > 1) {
    return { ok: false, error: "百分比不能大于 100%" };
  }

  return { ok: true, value: Math.round(value * 10_000) / 10_000 };
}

/** 平台名归一化：小红书 / xhs -> xiaohongshu；无法识别返回 null（按未填处理）。 */
const PLATFORM_EXTRA_ALIASES: Record<string, string[]> = {
  xiaohongshu: ["xhs", "red", "红书", "小红书"],
  bilibili: ["b站", "bili", "哔哩哔哩", "哔哩"],
  douyin: ["dy", "tiktok", "抖", "抖音"],
};

export function normalizePlatform(raw: string): string | null {
  const key = normalizeHeader(raw);
  if (key.length === 0) {
    return null;
  }

  for (const item of PLATFORMS) {
    const candidates = [item.value, item.label, ...(PLATFORM_EXTRA_ALIASES[item.value] ?? [])];
    if (candidates.some((candidate) => normalizeHeader(candidate) === key)) {
      return item.value;
    }
  }

  return null;
}

// ---------- 日期归一化（统一按 Asia/Shanghai 处理） ----------

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 不带时区的时间一律按北京时间解释；日期型输入落到当天 12:00，避免跨时区串日。 */
function fromShanghaiParts(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }
  if (year < 2000 || year > 2100) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute) - SHANGHAI_OFFSET_MS);
  const back = new Date(date.getTime() + SHANGHAI_OFFSET_MS);

  // 回读校验：拒绝 2 月 30 日这类不存在的日期
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * 解析用户输入的时间，支持：
 * 2026-09-01 / 2026/9/1 / 2026.9.1 / 2026年9月1日 / 9/1（补当年）/ 9月1日 / 完整 ISO 时间
 */
export function parseDateInput(raw: string): Date | null {
  const text = raw.trim();
  if (text.length === 0) {
    return null;
  }

  const dateTime = DATE_TIME_PATTERN.exec(text);
  if (dateTime) {
    const zone = dateTime[7];
    if (zone !== undefined) {
      const parsed = new Date(text);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return fromShanghaiParts(
      Number(dateTime[1]),
      Number(dateTime[2]),
      Number(dateTime[3]),
      Number(dateTime[4]),
      Number(dateTime[5]),
    );
  }

  const chinese = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(text);
  if (chinese) {
    return fromShanghaiParts(Number(chinese[1]), Number(chinese[2]), Number(chinese[3]));
  }

  const full = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (full) {
    return fromShanghaiParts(Number(full[1]), Number(full[2]), Number(full[3]));
  }

  const short = /^(\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (short) {
    return fromShanghaiParts(currentShanghaiYear(), Number(short[1]), Number(short[2]));
  }

  const chineseShort = /^(\d{1,2})月(\d{1,2})日$/.exec(text);
  if (chineseShort) {
    return fromShanghaiParts(currentShanghaiYear(), Number(chineseShort[1]), Number(chineseShort[2]));
  }

  return null;
}

function currentShanghaiYear(): number {
  return new Date(Date.now() + SHANGHAI_OFFSET_MS).getUTCFullYear();
}

/** 把时间格式化成北京时间日期字符串（YYYY-MM-DD），用于 prompt 与页面展示。 */
export function toShanghaiDateString(date: Date): string {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
// ---------- 逐行分析（预览用，不写库） ----------

export type CsvRowPreview = {
  /** 行号：含表头，从 1 开始，方便用户对照粘贴内容 */
  index: number;
  raw: string[];
  /** 校验通过时为归一化后的数据，可直接提交；有错误时为 null */
  data: PostInput | null;
  errors: string[];
  /** 疑似重复：标题 + 发布时间一致（本批内或已录入过） */
  duplicate: boolean;
};

export type CsvPreview = {
  columns: string[];
  mapping: Record<string, PostFieldKey>;
  /** 未识别的列名，这些列会被忽略 */
  unmatched: string[];
  missingRequired: PostFieldKey[];
  rows: CsvRowPreview[];
  summary: { total: number; valid: number; invalid: number; duplicate: number };
};

/** 重复判定键：标题（忽略大小写与首尾空格）+ 北京时间日期。 */
export function postDuplicateKey(title: string, publishedAt: Date): string {
  return `${title.trim().toLowerCase()}|${toShanghaiDateString(publishedAt)}`;
}

/**
 * 解析并逐行校验 CSV。
 * - mapping 传入时视为「完整映射」（用户在预览页改过就以改过的为准），不传则自动识别
 * - existingKeys 用于标记「疑似重复」，本函数只标记、不会跳过任何行
 */
export function analyzeCsv(
  input: string,
  mapping?: Record<string, PostFieldKey>,
  existingKeys: Set<string> = new Set(),
): CsvPreview {
  const table = parseCsv(input);
  const columns = table[0] ?? [];
  const dataRows = table.slice(1);

  const effectiveMapping =
    mapping !== undefined && Object.keys(mapping).length > 0 ? mapping : autoMapColumns(columns);

  const fieldColumns: Partial<Record<PostFieldKey, number>> = {};
  for (const [columnIndex, field] of Object.entries(effectiveMapping)) {
    const index = Number(columnIndex);
    if (!Number.isInteger(index) || index < 0 || fieldColumns[field] !== undefined) {
      continue;
    }
    fieldColumns[field] = index;
  }

  const rows: CsvRowPreview[] = [];
  const keyCounts = new Map<string, number>();
  const rowKeys: Array<string | null> = [];

  dataRows.forEach((cells, rowIndex) => {
    const errors: string[] = [];

    const read = (field: PostFieldKey): string => {
      const column = fieldColumns[field];
      if (column === undefined) {
        return "";
      }
      return (cells[column] ?? "").trim();
    };

    const title = read("title").slice(0, POST_TITLE_MAX + 1);
    if (title.length === 0) {
      errors.push("标题不能为空");
    } else if (title.length > POST_TITLE_MAX) {
      errors.push(`标题最多 ${POST_TITLE_MAX} 字`);
    }

    const rawPublishedAt = read("publishedAt");
    const publishedAt = rawPublishedAt.length > 0 ? parseDateInput(rawPublishedAt) : null;
    if (rawPublishedAt.length === 0) {
      errors.push("缺少发布时间");
    } else if (publishedAt === null) {
      errors.push(`无法识别发布时间：「${rawPublishedAt.slice(0, 20)}」`);
    }

    const counts: Partial<Record<PostFieldKey, number | null>> = {};
    for (const field of ["impressions", "views", "likes", "comments", "saves", "shares", "followsGained"] as const) {
      const result = normalizeCount(read(field));
      if (!result.ok) {
        errors.push(`${POST_FIELD_LABELS[field]}：${result.error}`);
        continue;
      }
      counts[field] = result.value;
    }

    const rateResult = normalizeRate(read("completionRate"));
    if (!rateResult.ok) {
      errors.push(`${POST_FIELD_LABELS["completionRate"]}：${rateResult.error}`);
    }

    const platformRaw = read("platform");
    const platform = platformRaw.length > 0 ? normalizePlatform(platformRaw) : null;
    const note = read("note").slice(0, POST_NOTE_MAX);

    const valid = errors.length === 0 && publishedAt !== null;

    const data: PostInput | null = valid
      ? {
          ...(platform === null ? {} : { platform }),
          title,
          publishedAt: publishedAt.toISOString(),
          impressions: counts.impressions ?? null,
          views: counts.views ?? null,
          likes: counts.likes ?? null,
          comments: counts.comments ?? null,
          saves: counts.saves ?? null,
          shares: counts.shares ?? null,
          followsGained: counts.followsGained ?? null,
          completionRate: rateResult.ok ? rateResult.value : null,
          ...(note.length === 0 ? {} : { note }),
        }
      : null;

    const key = valid && publishedAt !== null ? postDuplicateKey(title, publishedAt) : null;
    rowKeys.push(key);
    if (key !== null) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }

    rows.push({ index: rowIndex + 2, raw: cells, data, errors, duplicate: false });
  });

  rows.forEach((row, position) => {
    const key = rowKeys[position];
    if (key === null || key === undefined) {
      return;
    }
    if ((keyCounts.get(key) ?? 0) > 1 || existingKeys.has(key)) {
      row.duplicate = true;
    }
  });

  return {
    columns,
    mapping: effectiveMapping,
    unmatched: unmatchedColumns(columns, effectiveMapping),
    missingRequired: missingRequiredFields(effectiveMapping),
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => row.data !== null).length,
      invalid: rows.filter((row) => row.data === null).length,
      duplicate: rows.filter((row) => row.duplicate).length,
    },
  };
}