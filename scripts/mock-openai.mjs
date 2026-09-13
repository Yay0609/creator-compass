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
 *   ok                   正常返回（选题 5 条 / 脚本 1 份）
 *   badjson              返回非 JSON 文本（触发修复重试）
 *   badcount             选题只返回 3 条；脚本只给 2 段（触发 Zod 校验失败 -> 修复重试 -> 降级草稿）
 *   badscript            返回结构不合法的脚本 JSON（标题不足 / 钩子为空），用于验证脚本降级
 *   http500              返回 500（触发指数退避重试，最终失败并回滚配额）
 *   slow                 延迟 60s 再返回（触发 45s 超时）
 *   nosupport_json_mode  带 response_format 时返回 400，去掉后正常返回
 *
 * 请求类型自动识别：提示词里出现 "titles" 视为脚本请求，否则视为选题请求。
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const HOST = process.env.MOCK_HOST ?? "127.0.0.1";
const MODES = [
  "ok",
  "badjson",
  "badcount",
  "badscript",
  "http500",
  "slow",
  "nosupport_json_mode",
];

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

/** 脚本结构（P3）：与 src/lib/ai/schemas/script.ts 的契约保持一致。 */
function scriptPayload() {
  return {
    titles: [
      "mock 标题一：三分钟讲清一个具体问题",
      "mock 标题二：新手最容易踩的 3 个坑",
      "mock 标题三：我用了半年才想明白的一件事",
    ],
    hook: "mock 数据：如果你也卡在这一步，先别划走，接下来 60 秒帮你省下一个月试错。",
    outline: [
      { section: "开场钩子", seconds: 8, content: "mock 口播：先说结论，再说为什么。", visual: "真人出镜 + 大字幕" },
      { section: "痛点展开", seconds: 20, content: "mock 口播：大多数人卡住的地方其实是这里。", visual: "屏幕录制" },
      { section: "方法一", seconds: 20, content: "mock 口播：第一步，先把问题拆成两半。", visual: "分步骤字幕" },
      { section: "结尾引导", seconds: 12, content: "mock 口播：你卡在哪一步？评论区告诉我。", visual: "看向镜头" },
    ],
    tags: ["mock", "新手", "口播"],
    coverCopy: "mock 封面文案",
    cta: "关注我，下期讲怎么复盘。",
  };
}

/** 故意不合法的脚本（标题只有 1 个、钩子为空、分段只有 2 段），用于验证降级草稿。 */
function badScriptPayload() {
  return {
    titles: ["只有一个标题候选"],
    hook: "",
    outline: [
      { section: "开场", seconds: 0, content: "内容太短", visual: "" },
      { section: "结尾", seconds: 0, content: "内容太短", visual: "" },
    ],
    tags: ["只有一个标签"],
    coverCopy: "封面文案",
  };
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
    const wantsScript = prompt.includes('"titles"');
    const record = {
      at: new Date().toISOString(),
      mode,
      kind: wantsScript ? "script" : "topic",
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
      `[mock] ${mode} <- chat/completions（${record.kind}，prompt ${prompt.length} 字，max_tokens=${record.maxTokens}，response_format=${record.hasResponseFormat}）`,
    );

    if (mode === "http500") {
      sendJson(res, 500, { error: { message: "mock upstream failure", type: "server_error" } });
      return;
    }

    if (mode === "slow") {
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      sendJson(
        res,
        200,
        completion(JSON.stringify(wantsScript ? scriptPayload() : { items: items(5) })),
      );
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
      sendJson(
        res,
        200,
        completion(JSON.stringify(wantsScript ? badScriptPayload() : { items: items(3) })),
      );
      return;
    }

    if (mode === "badscript") {
      sendJson(res, 200, completion(JSON.stringify(badScriptPayload())));
      return;
    }

    sendJson(
      res,
      200,
      completion(JSON.stringify(wantsScript ? scriptPayload() : { items: items(5) })),
    );
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
