/**
 * 把接口错误翻译成对用户有帮助的中文提示（纯函数，客户端可用）。
 *
 * 服务端已经给出面向用户的 message，这里只在少数「用户可以立刻采取行动」的错误码上
 * 补充下一步建议，不覆盖服务端文案，避免两端说法不一致。
 */

export type ClientErrorLike = { code?: string; message?: string } | null | undefined;

const FALLBACK_MESSAGE = "请求失败，请稍后重试";

/** 需要补充「下一步怎么办」的错误码。 */
const ACTION_HINTS: Record<string, string> = {
  RATE_LIMITED: "今日 AI 调用次数已达上限，明天 00:00（北京时间）自动恢复。",
  QUOTA_EXCEEDED: "额度每月 1 日重置，可在「设置」页查看用量明细。",
  UNAUTHORIZED: "登录状态已失效，请重新登录后再继续。",
  AI_UNAVAILABLE: "上游模型服务暂时不可用，稍等片刻重试通常就能恢复。",
  AI_INVALID_OUTPUT: "可以再点一次生成，或直接编辑草稿后保存。",
  NETWORK: "请检查网络连接后重试，已经生成的内容不会丢失。",
};

/** 组装展示给用户的错误文案。 */
export function describeError(error: ClientErrorLike): string {
  if (!error) {
    return FALLBACK_MESSAGE;
  }

  const raw = error.message ?? "";
  const message = raw.trim().length > 0 ? raw.trim() : FALLBACK_MESSAGE;
  const hint = error.code ? ACTION_HINTS[error.code] : undefined;

  if (!hint || message.includes(hint)) {
    return message;
  }

  return message + " " + hint;
}
