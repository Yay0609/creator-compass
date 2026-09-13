import "server-only";

/**
 * AI 网关错误。code 决定「是否重试」与「如何落库」，message 面向服务端日志与用户提示。
 * 本模块只在服务端使用，禁止被客户端组件引用。
 */
export const AI_ERROR_CODES = [
  "timeout",
  "aborted",
  "network",
  "rate_limited",
  "http_error",
  "invalid_json",
  "unsupported_json_mode",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

/** 落库到 AiCallLog.status 的取值（与 prisma/schema.prisma 注释保持一致）。 */
export const AI_CALL_STATUSES = ["ok", "error", "timeout", "invalid_json", "rate_limited"] as const;

export type AiCallStatus = (typeof AI_CALL_STATUSES)[number];

/** 单次尝试的元数据，用于写 AiCallLog（不含 prompt 与模型原文）。 */
export type AiAttempt = {
  attempt: number;
  status: AiCallStatus;
  httpStatus: number | null;
  latencyMs: number;
  errorCode: string | null;
  totalTokens: number | null;
};

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly httpStatus?: number;

  /** 失败前已经发生的尝试明细，由 provider 回填，便于调用方落库。 */
  attempts: AiAttempt[] = [];

  constructor(
    code: AiErrorCode,
    message: string,
    options?: { retryable?: boolean; httpStatus?: number; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AiError";
    this.code = code;
    this.retryable = options?.retryable ?? false;

    if (options?.httpStatus !== undefined) {
      this.httpStatus = options.httpStatus;
    }
  }
}

/** AiError -> AiCallLog.status 的映射。 */
export function toCallStatus(error: unknown): AiCallStatus {
  if (!(error instanceof AiError)) {
    return "error";
  }

  switch (error.code) {
    case "timeout":
      return "timeout";
    case "invalid_json":
      return "invalid_json";
    case "rate_limited":
      return "rate_limited";
    default:
      return "error";
  }
}
