export const APP_NAME = "创作罗盘";

export const APP_DESCRIPTION =
  "面向小红书 / B站 / 抖音 0–1 万粉新手创作者的 AI 选题、脚本与数据复盘助手。";

type Option = { readonly value: string; readonly label: string };

export function optionValues<T extends readonly Option[]>(options: T): T[number]["value"][] {
  return options.map((item) => item.value) as T[number]["value"][];
}

export function optionLabel(options: readonly Option[], value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return options.find((item) => item.value === value)?.label ?? value;
}

export const PLATFORMS = [
  { value: "xiaohongshu", label: "小红书" },
  { value: "bilibili", label: "B站" },
  { value: "douyin", label: "抖音" },
] as const;

export type Platform = (typeof PLATFORMS)[number]["value"];

export const NICHES = [
  "穿搭",
  "美妆",
  "美食",
  "职场",
  "情感",
  "家居",
  "健身",
  "学习",
  "副业",
  "数码",
  "母婴",
  "旅行",
  "宠物",
] as const;

export type Niche = (typeof NICHES)[number];

export const GOALS = [
  { value: "grow", label: "涨粉走红" },
  { value: "monetize", label: "接商单变现" },
  { value: "sell", label: "给自营生意引流" },
  { value: "record", label: "记录与表达" },
  { value: "learn", label: "练习与成长" },
] as const;

export const TONES = [
  { value: "friendly", label: "亲切" },
  { value: "professional", label: "专业" },
  { value: "sharp", label: "犀利" },
  { value: "funny", label: "沙雕" },
  { value: "healing", label: "治愈" },
] as const;

export const CONTENT_FORMATS = [
  { value: "graphic", label: "图文" },
  { value: "talking", label: "口播" },
  { value: "vlog", label: "Vlog" },
  { value: "tutorial", label: "教程 / 干货" },
  { value: "review", label: "测评" },
] as const;

export const AI_FEATURES = ["topic", "script", "review"] as const;

export type AiFeature = (typeof AI_FEATURES)[number];
// ---------- AI 网关（P2） ----------

/** 单次 AI 请求硬超时（毫秒）。超时不重试：重试会把等待时间翻倍，且受 Vercel 执行时长限制。 */
/** 值由环境变量 AI_TIMEOUT_MS 决定（P5 起）；这里是兜底默认值与允许区间。 */
export const AI_TIMEOUT_MS_FALLBACK = 45_000;
export const AI_TIMEOUT_MS_MIN = 5_000;
export const AI_TIMEOUT_MS_LIMIT = 120_000;

/** 单次请求 max_tokens 上限，防止模型跑飞导致费用与延迟失控。
 * P4 起提升到 3000：复盘报告（诊断 + 建议 + 下一批选题）比选题 / 脚本更长，
 * 由 prompt 约束输出规模，避免被截断。 */
/** 值由环境变量 AI_MAX_TOKENS 决定（P5 起）；这里是兜底默认值与硬上限。 */
export const AI_MAX_TOKENS_FALLBACK = 3_000;
export const AI_MAX_TOKENS_LIMIT = 8_192;

/** AiCallLog 默认保留天数（P5 起可用 AI_LOG_RETENTION_DAYS 覆盖）。 */
export const AI_LOG_RETENTION_DAYS_FALLBACK = 90;

/** 最多尝试次数（含首次）。仅 429 / 5xx / 网络错误会重试。 */
export const AI_MAX_ATTEMPTS = 3;

/** 指数退避基准：第 n 次重试等待 base * 2^(n-1) 毫秒。 */
export const AI_RETRY_BASE_DELAY_MS = 800;

/** Prompt 版本号，便于回归对比与回滚。 */
export const AI_PROMPT_VERSION = "topic-v1";

/** 每次生成的选题条数（P2 固定 5 条）。 */
export const TOPIC_BATCH_SIZE = 5;

/** 「换一批」最多携带的历史标题数，用于避免重复选题。 */
export const TOPIC_EXCLUDE_TITLES_MAX = 10;

/** 选题历史分页：默认页大小与上限。 */
export const TOPIC_PAGE_SIZE = 20;
export const TOPIC_PAGE_SIZE_MAX = 50;

/** SSE 心跳间隔：防止中间代理因空闲断开长连接。 */
export const SSE_HEARTBEAT_MS = 15_000;

/** 每日防刷计数使用的 kind（全局计数，不分功能）。 */
export const AI_DAILY_KIND = "ai_daily";

// ---------- AI 进度（选题 / 脚本共用） ----------

/** AI 生成的进度阶段。选题与脚本共用一份枚举，避免两端漂移。 */
export const AI_PROGRESS_PHASES = ["calling", "parsing", "validating", "repairing"] as const;

export type AiProgressPhase = (typeof AI_PROGRESS_PHASES)[number];

// ---------- 脚本（P3） ----------

/** 脚本 Prompt 版本号，便于回归对比与回滚。 */
export const SCRIPT_PROMPT_VERSION = "script-v1";

/** 标题候选数量：至少 3 个，最多 5 个。 */
export const SCRIPT_TITLES_MIN = 3;
export const SCRIPT_TITLES_MAX = 5;

/** 分段脚本的段数范围。 */
export const SCRIPT_OUTLINE_MIN = 3;
export const SCRIPT_OUTLINE_MAX = 8;

/** 目标时长（秒）：默认 60s，可调范围 15s–600s。 */
export const SCRIPT_DURATION_DEFAULT_SEC = 60;
export const SCRIPT_DURATION_MIN_SEC = 15;
export const SCRIPT_DURATION_MAX_SEC = 600;

/** 脚本历史分页：默认页大小与上限。 */
export const SCRIPT_PAGE_SIZE = 20;
export const SCRIPT_PAGE_SIZE_MAX = 50;
// ---------- 作品数据与复盘（P4） ----------

/** 复盘 Prompt 版本号，便于回归对比与回滚。 */
export const REVIEW_PROMPT_VERSION = "review-v1";

/** 单次复盘可纳入的作品数量区间。 */
export const REVIEW_POST_MIN = 1;
export const REVIEW_POST_MAX = 50;

/** 分维度诊断条数区间。 */
export const REVIEW_DIAGNOSTICS_MIN = 3;
export const REVIEW_DIAGNOSTICS_MAX = 5;

/** 亮点 / 问题各 1–4 条。 */
export const REVIEW_POINTS_MIN = 1;
export const REVIEW_POINTS_MAX = 4;

/** 下一步建议 3–5 条。 */
export const REVIEW_SUGGESTIONS_MIN = 3;
export const REVIEW_SUGGESTIONS_MAX = 5;

/** 下一批选题建议固定 3 条。 */
export const REVIEW_NEXT_TOPICS_COUNT = 3;

/** 复盘历史分页：默认页大小与上限。 */
export const REVIEW_PAGE_SIZE = 20;
export const REVIEW_PAGE_SIZE_MAX = 50;

/** 作品历史分页：默认页大小与上限。 */
export const POST_PAGE_SIZE = 20;
export const POST_PAGE_SIZE_MAX = 50;

/** 单次 CSV 导入的行数上限与请求体上限（50KB）。 */
export const POST_IMPORT_MAX_ROWS = 200;
export const POST_IMPORT_MAX_CSV_CHARS = 50_000;

/** 计数类字段的合法上限（防止误粘贴天文数字撑爆图表）。 */
export const POST_COUNT_MAX = 1_000_000_000;

/** 作品标题与备注长度上限。 */
export const POST_TITLE_MAX = 80;
export const POST_NOTE_MAX = 200;