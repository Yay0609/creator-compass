/** 统一错误码。新增错误码时必须同时补齐 HTTP 状态与默认文案。 */
export const ErrorCode = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
  AI_INVALID_OUTPUT: "AI_INVALID_OUTPUT",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  AI_UNAVAILABLE: 503,
  AI_INVALID_OUTPUT: 502,
  INTERNAL: 500,
};

export const DEFAULT_ERROR_MESSAGE: Record<ErrorCode, string> = {
  BAD_REQUEST: "请求参数不合法",
  VALIDATION_FAILED: "请求参数校验失败",
  UNAUTHORIZED: "请先登录",
  FORBIDDEN: "没有访问权限",
  NOT_FOUND: "资源不存在",
  CONFLICT: "资源状态冲突",
  RATE_LIMITED: "请求过于频繁，请稍后再试",
  QUOTA_EXCEEDED: "本月 AI 额度已用完，下月自动恢复",
  AI_UNAVAILABLE: "AI 服务暂时不可用，请稍后再试",
  AI_INVALID_OUTPUT: "AI 返回内容格式异常，请重试",
  INTERNAL: "服务内部错误，请稍后重试",
};