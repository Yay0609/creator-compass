#!/usr/bin/env node
/**
 * 本地 mock 上游（OpenAI 兼容），用于在没有真实 API Key 的情况下跑通 AI 链路（P2/P3/P4 复用）。
 * 只监听 127.0.0.1，不对外暴露，也不涉及任何真实密钥。
 *
 * 启动：
 *   node scripts/mock-openai.mjs
 * 切换模式：
 *   curl -X POST http://127.0.0.1:4010/mock/mode -H "Content-Type: application/json" -d "{\"mode\":\"badjson\"}"
 * 查看记录（含最近一次 prompt，用于验证「换一批」是否带上 excludeTitles）：
 *   curl http://127.0.0.1:4010/mock/log
 *
 * 模式：
 *   ok                   正常返回 5 条合法选题
 *   badjson              返回非 JSON 文本（触发修复重试）
 *   badcount             只返回 3 条（触发 Zod 校验失败 -> 修复重试 -> 降级草稿）
 *   http500              返回 500（触发指数退避重试，最终失败并回滚配额）
 *   slow                 延迟 60s 再返回（触发 45s 超时）
 *   nosupport_json_mode  带 response_format 时返回 400，去掉后正常返回
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const HOST = process.env.MOCK_HOST ?? "127.0.0.1";
const MODES = ["ok", "badjson", "badcount", "http500", "slow", "nosupport_json_mode"];

let mode = "ok";
const calls = [];

function items(count) {
  return Array.from({ length: count }, (_, index) => ({
    title: `mock 选题 ${index + 1}：三分钟讲清一个具体问题`,
    angle: `从第 ${index + 1} 个常见误区切入`,
    reason: "mock 数据：与账号画像的赛道和粉丝量级匹配",
    referenceDirection: "mock 数据：先给结论，再给 3 个可验证的步骤，结尾引导评论",
    keywords: ["mock", `关键词${index + 1}`, "新手"],
    score: 90 - index * 5,
    difficulty: ["low", "medium", "high"][index % 3],
  }));
}

function completion(content) {
  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "mock-model",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 120, completion_tokens: 260, total_tokens: 380 },
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw.length > 0 ? JSON.parse(raw) : null);
      } catch {
        resolve(null);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  if (url.pathname === "/mock/mode" && req.method === "GET") {
    sendJson(res, 200, { mode, modes: MODES });
    return;
  }

  if (url.pathname === "/mock/mode" && req.method === "POST") {
    const body = await readBody(req);
    const next = body && typeof body.mode === "string" ? body.mode : "";
    if (!MODES.includes(next)) {
      sendJson(res, 400, { error: `未知模式：${next}`, modes: MODES });
      return;
    }
    mode = next;
    console.log(`[mock] 模式切换为 ${mode}`);
    sendJson(res, 200, { mode });
    return;
  }

  if (url.pathname === "/mock/log" && req.method === "GET") {
    const limit = Number(url.searchParams.get("limit") ?? 5);
    sendJson(res, 200, { mode, total: calls.length, calls: calls.slice(-limit) });
    return;
  }

  if (url.pathname === "/mock/log" && req.method === "DELETE") {
    calls.length = 0;
    sendJson(res, 200, { cleared: true });
    return;
  }

  if (url.pathname.endsWith("/chat/completions") && req.method === "POST") {
    const body = await readBody(req);
    const prompt = Array.isArray(body?.messages)
      ? body.messages.map((message) => `${message.role}: ${message.content}`).join("\n")
      : "";
    const record = {
      at: new Date().toISOString(),
      mode,
      model: body?.model ?? null,
      hasResponseFormat: body?.response_format !== undefined,
      maxTokens: body?.max_tokens ?? null,
      promptChars: prompt.length,
      prompt,
    };

    calls.push(record);
    if (calls.length > 50) {
      calls.shift();
    }

    console.log(
      `[mock] ${mode} <- chat/completions（prompt ${prompt.length} 字，max_tokens=${record.maxTokens}，response_format=${record.hasResponseFormat}）`,
    );

    if (mode === "http500") {
      sendJson(res, 500, { error: { message: "mock upstream failure", type: "server_error" } });
      return;
    }

    if (mode === "slow") {
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      sendJson(res, 200, completion(JSON.stringify({ items: items(5) })));
      return;
    }

    if (mode === "nosupport_json_mode" && record.hasResponseFormat) {
      sendJson(res, 400, {
        error: {
          message: "response_format is not supported by this model",
          type: "invalid_request_error",
        },
      });
      return;
    }

    if (mode === "badjson") {
      sendJson(res, 200, completion("抱歉，这次我直接用文字回答了，没有输出 JSON。"));
      return;
    }

    if (mode === "badcount") {
      sendJson(res, 200, completion(JSON.stringify({ items: items(3) })));
      return;
    }

    sendJson(res, 200, completion(JSON.stringify({ items: items(5) })));
    return;
  }

  sendJson(res, 404, { error: `未实现的 mock 路由：${req.method} ${url.pathname}` });
});

server.listen(PORT, HOST, () => {
  console.log(
    `[mock] OpenAI 兼容 mock 已启动：http://${HOST}:${PORT}/v1/chat/completions（当前模式 ${mode}）`,
  );
  console.log('[mock] 切换模式：POST /mock/mode {"mode":"badjson"}；查看记录：GET /mock/log');
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`[mock] 收到 ${signal}，关闭中…`);
    server.close(() => process.exit(0));
  });
}
