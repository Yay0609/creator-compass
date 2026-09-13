import "server-only";

import { z } from "zod";

import {
  AI_MAX_ATTEMPTS,
  AI_MAX_TOKENS_LIMIT,
  AI_RETRY_BASE_DELAY_MS,
  AI_TIMEOUT_MS_LIMIT,
} from "@/lib/constants";
import { getEnv } from "@/lib/env";

import { AiError, toCallStatus, type AiAttempt } from "./errors";

/**
 * AI 网关：全站唯一的模型调用出口，禁止任何地方绕过这里直连上游。
 *
 * 约束：
 * - 超时 45s（不重试：重试会让等待时间翻倍）
 * - 仅 429 / 5xx / 网络错误做指数退避重试（800ms、2400ms，最多 3 次尝试）
 * - max_tokens 硬上限，防止费用与延迟失控
 * - 上游不支持 response_format 时自动降级重试一次（不占用重试预算）
 * - 只返回文本与元数据；调用方负责 Zod 校验与落库
 */

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

export type ChatUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type ChatJsonResult = {
  text: string;
  model: string;
  latencyMs: number;
  promptChars: number;
  usage: ChatUsage;
  attempts: AiAttempt[];
};

export type CallChatJsonOptions = {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** 仅供测试注入 */
  timeoutMs?: number;
  retryDelayMs?: number;
};

/** OpenAI 兼容响应中我们关心的部分（其余字段忽略）。 */
const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() }).optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function truncate(text: string, max = 300): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;

    const handleAbort = () => {
      clearTimeout(timer);
      reject(new AiError("aborted", "客户端已断开，AI 调用中止"));
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", handleAbort);
  });
}

type RequestOnceParams = {
  url: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  jsonMode: boolean;
  timeoutMs: number;
  signal?: AbortSignal;
};

/** 单次 HTTP 调用：把各种失败统一翻译成带「是否可重试」语义的 AiError。 */
async function requestOnce(
  params: RequestOnceParams,
): Promise<{ content: string; totalTokens: number | null }> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, params.timeoutMs);

  if (params.signal) {
    if (params.signal.aborted) {
      clearTimeout(timer);
      throw new AiError("aborted", "客户端已断开，AI 调用中止");
    }
    params.signal.addEventListener("abort", abortFromCaller);
  }

  try {
    const response = await fetch(params.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const bodyText = await response.text();

    if (!response.ok) {
      if (params.signal?.aborted) {
        throw new AiError("aborted", "客户端已断开，AI 调用中止");
      }
      if (timedOut) {
        throw new AiError("timeout", `AI 调用超过 ${params.timeoutMs}ms 未返回`);
      }

      const detail = truncate(bodyText);

      if (response.status === 429) {
        throw new AiError("rate_limited", `AI 服务限流（429）：${detail}`, {
          retryable: true,
          httpStatus: 429,
        });
      }
      if (response.status >= 500) {
        throw new AiError("http_error", `AI 服务异常（${response.status}）：${detail}`, {
          retryable: true,
          httpStatus: response.status,
        });
      }
      if (response.status === 400 && params.jsonMode) {
        throw new AiError("unsupported_json_mode", `上游不支持 response_format（400）：${detail}`, {
          httpStatus: 400,
        });
      }
      throw new AiError("http_error", `AI 服务拒绝了请求（${response.status}）：${detail}`, {
        httpStatus: response.status,
      });
    }

    const parsed = completionSchema.safeParse(safeJsonParse(bodyText));
    if (!parsed.success) {
      throw new AiError("invalid_json", "AI 响应结构不符合 OpenAI 兼容格式", { httpStatus: 200 });
    }

    const content = parsed.data.choices[0]?.message?.content ?? "";
    if (content.trim().length === 0) {
      throw new AiError("invalid_json", "AI 返回内容为空", { httpStatus: 200 });
    }

    return { content, totalTokens: parsed.data.usage?.total_tokens ?? null };
  } catch (error) {
    if (error instanceof AiError) {
      throw error;
    }
    if (params.signal?.aborted) {
      throw new AiError("aborted", "客户端已断开，AI 调用中止");
    }
    if (timedOut) {
      throw new AiError("timeout", `AI 调用超过 ${params.timeoutMs}ms 未返回`);
    }
    throw new AiError("network", "调用 AI 服务失败（网络异常）", { retryable: true, cause: error });
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function callChatJson(options: CallChatJsonOptions): Promise<ChatJsonResult> {
  const env = getEnv();
  const model = env.OPENAI_MODEL;
  const url = `${env.OPENAI_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
  const timeoutMs = Math.min(options.timeoutMs ?? env.AI_TIMEOUT_MS, AI_TIMEOUT_MS_LIMIT);
  const retryDelayMs = options.retryDelayMs ?? AI_RETRY_BASE_DELAY_MS;
  const maxTokens = Math.min(options.maxTokens ?? env.AI_MAX_TOKENS, AI_MAX_TOKENS_LIMIT);
  const temperature = options.temperature ?? 0.7;
  const promptChars = options.messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );
  const startedAt = Date.now();

  const attempts: AiAttempt[] = [];
  let jsonMode = true;
  let callIndex = 0;
  let retryBudget = 0;

  for (;;) {
    callIndex += 1;
    const callStartedAt = Date.now();

    try {
      const result = await requestOnce({
        url,
        apiKey: env.OPENAI_API_KEY,
        model,
        messages: options.messages,
        maxTokens,
        temperature,
        jsonMode,
        timeoutMs,
        signal: options.signal,
      });

      attempts.push({
        attempt: callIndex,
        status: "ok",
        httpStatus: 200,
        latencyMs: Date.now() - callStartedAt,
        errorCode: null,
        totalTokens: result.totalTokens,
      });

      return {
        text: result.content,
        model,
        latencyMs: Date.now() - startedAt,
        promptChars,
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: result.totalTokens,
        },
        attempts,
      };
    } catch (error) {
      const aiError =
        error instanceof AiError
          ? error
          : new AiError("network", "调用 AI 服务失败", { retryable: true, cause: error });

      attempts.push({
        attempt: callIndex,
        status: toCallStatus(aiError),
        httpStatus: aiError.httpStatus ?? null,
        latencyMs: Date.now() - callStartedAt,
        errorCode: aiError.code,
        totalTokens: null,
      });

      // 上游不支持 response_format：摘掉该参数立即重试一次，不消耗重试预算
      if (aiError.code === "unsupported_json_mode" && jsonMode) {
        jsonMode = false;
        continue;
      }

      retryBudget += 1;

      if (!aiError.retryable || retryBudget >= AI_MAX_ATTEMPTS) {
        aiError.attempts = attempts;
        throw aiError;
      }

      await sleep(retryDelayMs * 2 ** (retryBudget - 1), options.signal);
    }
  }
}
