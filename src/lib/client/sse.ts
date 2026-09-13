import {
  sseReviewDoneSchema,
  sseReviewMetaSchema,
  sseReviewSchema,
  type SseReviewDone,
  type SseReviewEvent,
  type SseReviewMeta,
} from "@/lib/reviews/schemas";
import {
  sseScriptDoneSchema,
  sseScriptMetaSchema,
  sseScriptSchema,
  type SseScriptDone,
  type SseScriptEvent,
  type SseScriptMeta,
  type SseScriptProgress,
} from "@/lib/scripts/schemas";
import {
  sseDoneSchema,
  sseErrorSchema,
  sseMetaSchema,
  sseProgressSchema,
  sseTopicSchema,
  type SseDone,
  type SseError,
  type SseMeta,
  type SseProgress,
  type SseTopic,
} from "@/lib/topics/schemas";

/**
 * 浏览器侧 SSE 客户端。
 *
 * 不能用 EventSource：它只支持 GET，而我们既需要 POST body，也需要带上会话 Cookie。
 * 因此用 fetch + ReadableStream 手写解析，并逐个事件过 Zod 校验（流式数据同样属于外部输入）。
 */

export class SseRequestError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "SseRequestError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export type SseHandlers = {
  onMeta?: (data: SseMeta) => void;
  onProgress?: (data: SseProgress) => void;
  onTopic?: (data: SseTopic) => void;
  /** 脚本生成：meta / progress 事件结构与选题共用 */
  onScriptMeta?: (data: SseScriptMeta) => void;
  onScriptProgress?: (data: SseScriptProgress) => void;
  onScript?: (data: SseScriptEvent) => void;
  onScriptDone?: (data: SseScriptDone) => void;
  /** 复盘生成：progress 与选题 / 脚本共用 onProgress */
  onReviewMeta?: (data: SseReviewMeta) => void;
  onReview?: (data: SseReviewEvent) => void;
  onReviewDone?: (data: SseReviewDone) => void;
  onDone?: (data: SseDone) => void;
  onError?: (data: SseError) => void;
};

function dispatchBlock(block: string, handlers: SseHandlers): void {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith(":")) {
      continue; // 注释行（心跳）
    }
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }

  if (dataLines.length === 0) {
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    return;
  }

  switch (event) {
    case "meta": {
      // 选题与脚本的 meta 结构不同：按 schema 逐个试，命中哪个就派发哪个
      const topicMeta = sseMetaSchema.safeParse(payload);
      if (topicMeta.success) {
        handlers.onMeta?.(topicMeta.data);
        return;
      }

      const scriptMeta = sseScriptMetaSchema.safeParse(payload);
      if (scriptMeta.success) {
        handlers.onScriptMeta?.(scriptMeta.data);
        return;
      }

      const reviewMeta = sseReviewMetaSchema.safeParse(payload);
      if (reviewMeta.success) handlers.onReviewMeta?.(reviewMeta.data);
      return;
    }
    case "progress": {
      // phase / chars / attempt 两端结构一致，同时派发给两个回调
      const parsed = sseProgressSchema.safeParse(payload);
      if (parsed.success) {
        handlers.onProgress?.(parsed.data);
        handlers.onScriptProgress?.(parsed.data);
      }
      return;
    }
    case "topic": {
      const parsed = sseTopicSchema.safeParse(payload);
      if (parsed.success) handlers.onTopic?.(parsed.data);
      return;
    }
    case "script": {
      const parsed = sseScriptSchema.safeParse(payload);
      if (parsed.success) handlers.onScript?.(parsed.data);
      return;
    }
    case "review": {
      const parsed = sseReviewSchema.safeParse(payload);
      if (parsed.success) handlers.onReview?.(parsed.data);
      return;
    }
    case "done": {
      const topicDone = sseDoneSchema.safeParse(payload);
      if (topicDone.success) {
        handlers.onDone?.(topicDone.data);
        return;
      }

      const scriptDone = sseScriptDoneSchema.safeParse(payload);
      if (scriptDone.success) {
        handlers.onScriptDone?.(scriptDone.data);
        return;
      }

      const reviewDone = sseReviewDoneSchema.safeParse(payload);
      if (reviewDone.success) handlers.onReviewDone?.(reviewDone.data);
      return;
    }
    case "error": {
      const parsed = sseErrorSchema.safeParse(payload);
      if (parsed.success) handlers.onError?.(parsed.data);
      return;
    }
    default:
      return;
  }
}

function consumeBuffer(buffer: string, handlers: SseHandlers): string {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    if (block.trim().length > 0) {
      dispatchBlock(block, handlers);
    }
  }
  return rest;
}

type ErrorEnvelope = { ok: false; error: { code: string; message: string; details?: unknown } };

function readErrorEnvelope(payload: unknown): { code: string; message: string; details?: unknown } {
  if (payload !== null && typeof payload === "object" && "error" in payload) {
    const envelope = payload as ErrorEnvelope;
    if (envelope.error && typeof envelope.error.code === "string") {
      return {
        code: envelope.error.code,
        message:
          typeof envelope.error.message === "string"
            ? envelope.error.message
            : "请求失败，请稍后重试",
        details: envelope.error.details,
      };
    }
  }
  return { code: "NETWORK", message: "服务返回了无法识别的错误" };
}

/**
 * 发起一次流式请求。
 * - 开流前的错误（401 / 400 / 429）会抛 SseRequestError（响应体是普通 JSON）
 * - 开流后的错误通过 handlers.onError 回调（HTTP 已是 200）
 */
export async function streamSse(
  url: string,
  payload: unknown,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch {
    if (signal?.aborted) {
      throw new SseRequestError("ABORTED", "已取消本次生成");
    }
    throw new SseRequestError("NETWORK", "网络异常，请稍后重试");
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const parsed = readErrorEnvelope(body);
    throw new SseRequestError(parsed.code, parsed.message, parsed.details);
  }

  const body = response.body;
  if (!body) {
    throw new SseRequestError("NETWORK", "服务端未返回流式响应");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = consumeBuffer(buffer, handlers);
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      consumeBuffer(`${buffer}\n\n`, handlers);
    }
  } catch {
    if (signal?.aborted) {
      throw new SseRequestError("ABORTED", "已取消本次生成");
    }
    throw new SseRequestError("NETWORK", "流式响应中断，请重试");
  } finally {
    try {
      await reader.cancel();
    } catch {
      // 流已结束，忽略
    }
  }
}
