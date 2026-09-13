import "server-only";

import { NextResponse } from "next/server";

import { SSE_HEARTBEAT_MS } from "@/lib/constants";

/**
 * SSE 响应封装（服务端）。
 *
 * 约定：
 * - 固定 text/event-stream + Cache-Control: no-store + X-Accel-Buffering: no
 *   （最后一项用于关闭 Nginx 类代理的缓冲，否则事件会被攒着一起下发）
 * - 每 15s 发一条注释行作为心跳，避免中间代理因空闲断开长连接
 * - 客户端断开后写入静默失败，不会抛未处理异常
 *
 * 注意：本模块只负责「怎么把事件写出去」，业务错误归一化由调用方完成。
 */

export type SseWriter = {
  send: (event: string, data: unknown) => void;
  comment: (text: string) => void;
};

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export function createSseResponse(run: (sse: SseWriter) => Promise<void>): NextResponse {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const write = (chunk: string): void => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // 客户端已断开：后续写入直接丢弃
          closed = true;
        }
      };

      const heartbeat = setInterval(() => {
        write(": ping\n\n");
      }, SSE_HEARTBEAT_MS);

      const sse: SseWriter = {
        send(event, data) {
          // JSON.stringify 会转义换行，因此 data 中不会出现裸换行破坏协议
          write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        comment(text) {
          write(`: ${text.replace(/\n/g, " ")}\n\n`);
        },
      };

      try {
        await run(sse);
      } catch (error) {
        console.error("[sse] 流处理出现未捕获异常", error);
        sse.send("error", { code: "INTERNAL", message: "服务内部错误，请稍后重试" });
      } finally {
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // 流已关闭
        }
      }
    },
  });

  return new NextResponse(stream, { headers: SSE_HEADERS });
}
