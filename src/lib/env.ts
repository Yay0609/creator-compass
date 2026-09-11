import "server-only";

import { z } from "zod";

/**
 * 环境变量 schema。
 * 注意：数字型变量使用 coerce，字符串型保持原样。
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL 不能为空（SQLite 示例：file:./dev.db）"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET 至少需要 32 个字符"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY 不能为空"),
  OPENAI_BASE_URL: z.string().url("OPENAI_BASE_URL 必须是合法 URL"),
  OPENAI_MODEL: z.string().min(1, "OPENAI_MODEL 不能为空"),
  AI_DAILY_LIMIT: z.coerce.number().int("AI_DAILY_LIMIT 必须是整数").positive("AI_DAILY_LIMIT 必须大于 0"),
  QUOTA_TOPIC: z.coerce.number().int("QUOTA_TOPIC 必须是整数").nonnegative("QUOTA_TOPIC 不能为负数"),
  QUOTA_SCRIPT: z.coerce.number().int("QUOTA_SCRIPT 必须是整数").nonnegative("QUOTA_SCRIPT 不能为负数"),
  QUOTA_REVIEW: z.coerce.number().int("QUOTA_REVIEW 必须是整数").nonnegative("QUOTA_REVIEW 不能为负数"),
  APP_BASE_URL: z.string().url("APP_BASE_URL 必须是合法 URL"),
});

export type Env = z.infer<typeof envSchema>;

/** 校验来源。使用宽松类型，便于单测直接传入普通对象。 */
export type EnvSource = Record<string, string | undefined>;

/** 环境变量校验失败。issues 中只包含变量名与原因，绝不包含变量值。 */
export class EnvValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(
      `环境变量校验失败（请检查 .env，可参考 .env.example）：\n${issues
        .map((item) => `  - ${item}`)
        .join("\n")}`,
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
      return `${key}: ${issue.message}`;
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