import "server-only";

import { z } from "zod";

import {
  AI_LOG_RETENTION_DAYS_FALLBACK,
  AI_MAX_TOKENS_FALLBACK,
  AI_MAX_TOKENS_LIMIT,
  AI_TIMEOUT_MS_FALLBACK,
  AI_TIMEOUT_MS_LIMIT,
  AI_TIMEOUT_MS_MIN,
} from "@/lib/constants";

/**
 * 可选数字型环境变量：留空（空字符串）视为未设置，回落到默认值。
 * 这样 .env.example 里可以保留占位行，用户不填也不会导致校验失败。
 */
function optionalInt(params: {
  name: string;
  defaultValue: number;
  min: number;
  max: number;
  minMessage: string;
  maxMessage: string;
}) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.coerce
      .number()
      .int(params.name + " 必须是整数")
      .min(params.min, params.minMessage)
      .max(params.max, params.maxMessage)
      .default(params.defaultValue),
  );
}

/**
 * 可选字符串型环境变量：留空（空字符串）视为未设置。
 * 用于「不配置也能跑，配置后才启用」的开关型变量（如 CRON_SECRET）。
 */
function optionalText() {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().trim().min(1).optional(),
  );
}

/**
 * 环境变量 schema。
 * 注意：数字型变量使用 coerce，字符串型保持原样。
 *
 * P5 起新增（都带默认值，留空即使用默认值，不会导致启动失败）：
 * - AI_MAX_TOKENS：单次请求 max_tokens 上限
 * - AI_TIMEOUT_MS：单次请求硬超时（毫秒）
 * - AI_LOG_RETENTION_DAYS：AiCallLog 保留天数（清理脚本使用）
 *
 * P6 起新增：
 * - CRON_SECRET：Vercel Cron 调用 /api/cron/prune-ai-logs 的鉴权密钥（可选）
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL 不能为空（SQLite 示例：file:./dev.db）"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET 至少需要 32 个字符"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY 不能为空"),
  OPENAI_BASE_URL: z.string().url("OPENAI_BASE_URL 必须是合法 URL"),
  OPENAI_MODEL: z.string().min(1, "OPENAI_MODEL 不能为空"),
  AI_DAILY_LIMIT: z.coerce.number().int("AI_DAILY_LIMIT 必须是整数").positive("AI_DAILY_LIMIT 必须大于 0"),
  AI_MAX_TOKENS: optionalInt({
    name: "AI_MAX_TOKENS",
    defaultValue: AI_MAX_TOKENS_FALLBACK,
    min: 1,
    max: AI_MAX_TOKENS_LIMIT,
    minMessage: "AI_MAX_TOKENS 必须大于 0",
    maxMessage: "AI_MAX_TOKENS 不能超过 " + AI_MAX_TOKENS_LIMIT,
  }),
  AI_TIMEOUT_MS: optionalInt({
    name: "AI_TIMEOUT_MS",
    defaultValue: AI_TIMEOUT_MS_FALLBACK,
    min: AI_TIMEOUT_MS_MIN,
    max: AI_TIMEOUT_MS_LIMIT,
    minMessage: "AI_TIMEOUT_MS 不能小于 " + AI_TIMEOUT_MS_MIN,
    maxMessage: "AI_TIMEOUT_MS 不能超过 " + AI_TIMEOUT_MS_LIMIT,
  }),
  AI_LOG_RETENTION_DAYS: optionalInt({
    name: "AI_LOG_RETENTION_DAYS",
    defaultValue: AI_LOG_RETENTION_DAYS_FALLBACK,
    min: 1,
    max: 3650,
    minMessage: "AI_LOG_RETENTION_DAYS 至少为 1 天",
    maxMessage: "AI_LOG_RETENTION_DAYS 不能超过 3650 天",
  }),
  QUOTA_TOPIC: z.coerce.number().int("QUOTA_TOPIC 必须是整数").nonnegative("QUOTA_TOPIC 不能为负数"),
  QUOTA_SCRIPT: z.coerce.number().int("QUOTA_SCRIPT 必须是整数").nonnegative("QUOTA_SCRIPT 不能为负数"),
  QUOTA_REVIEW: z.coerce.number().int("QUOTA_REVIEW 必须是整数").nonnegative("QUOTA_REVIEW 不能为负数"),
  APP_BASE_URL: z.string().url("APP_BASE_URL 必须是合法 URL"),
  /**
   * 生产 Cron 鉴权密钥（P6）。留空即视为未启用：
   * 生产环境下 /api/cron/* 会拒绝执行，非生产环境放行以便本地手工验证。
   */
  CRON_SECRET: optionalText(),
});

export type Env = z.infer<typeof envSchema>;

/** 校验来源。使用宽松类型，便于单测直接传入普通对象。 */
export type EnvSource = Record<string, string | undefined>;

/** 环境变量校验失败。issues 中只包含变量名与原因，绝不包含变量值。 */
export class EnvValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(
      "环境变量校验失败（请检查 .env，可参考 .env.example）：\n" +
        issues.map((item) => "  - " + item).join("\n"),
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

/**
 * 纯函数校验：不读取模块级状态，便于单测。
 * 模块加载时不会调用它，因此缺少环境变量不会导致构建期抛错。
 */
export function validateEnv(source: EnvSource = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "(root)";
      return key + ": " + issue.message;
    });
    throw new EnvValidationError(issues);
  }

  return result.data;
}

let cachedEnv: Env | undefined;

/** 延迟校验：首次调用时才读取 process.env 并校验，结果会被缓存。 */
export function getEnv(): Env {
  cachedEnv ??= validateEnv(process.env);
  return cachedEnv;
}

/** 仅供测试使用：清空缓存，便于验证延迟校验行为。 */
export function resetEnvCache(): void {
  cachedEnv = undefined;
}
