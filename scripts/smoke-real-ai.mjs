#!/usr/bin/env node
/**
 * 真实上游冒烟（P5）。
 *
 * 覆盖链路：
 *   注册 -> 登录 -> 建账号画像 -> 生成选题（SSE）-> 生成脚本（SSE）
 *   -> 录入 3 条作品 -> 生成复盘（SSE）-> 用量与 AiCallLog 落库校验 -> 注销账号级联清理
 *
 * 用法：
 *   1) 在 .env 填好真实的上游配置（DeepSeek 示例）：
 *        OPENAI_BASE_URL="https://api.deepseek.com/v1"
 *        OPENAI_MODEL="deepseek-chat"
 *        OPENAI_API_KEY="sk-..."
 *   2) 另开终端启动服务：corepack pnpm build && corepack pnpm start
 *   3) node scripts/smoke-real-ai.mjs
 *
 * 可选参数：
 *   --base=http://127.0.0.1:3000   目标站点（默认 127.0.0.1:3000）
 *   --keep                         跑完保留测试账号（排查用）
 *   --allow-placeholder-key        跳过密钥形态校验（仅用于本地 mock 上游自检）
 *
 * 约定：
 *   - 不打印密钥、不打印 prompt 与模型原文，只断言行数与状态
 *   - 测试账号使用随机邮箱，正常路径跑完即注销，不污染真实数据
 *   - 本脚本不进生产构建，只在本地 / 预发手动执行
 */

import { PrismaClient } from "@prisma/client";

import { loadEnvFile } from "./load-env.mjs";

const HTTP_TIMEOUT_MS = 180_000;
const PROBE_TIMEOUT_MS = 30_000;
const EXPECTED_TOPIC_COUNT = 5;
const QUOTA_KINDS = ["topic", "script", "review"];
const PROGRESS_PHASES = ["calling", "parsing", "validating", "repairing"];

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /your[-_ ]?key/i,
  /changeme/i,
  /^sk-\.{3,}$/i,
  /^sk-x+$/i,
];

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const readOption = (name, fallback) => {
  const hit = args.find((item) => item.startsWith(name + "="));
  return hit ? hit.slice(name.length + 1) : fallback;
};

const BASE_URL = readOption(
  "--base",
  process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000",
).replace(/\/+$/, "");
const KEEP_ACCOUNT = hasFlag("--keep");
/** 本地 mock 自检时允许占位密钥；接真实上游时必须保持关闭 */
const ALLOW_PLACEHOLDER_KEY = hasFlag("--allow-placeholder-key");

let stepNo = 0;
let smokeEmail = null;

function step(title) {
  stepNo += 1;
  console.log("\n[" + stepNo + "] " + title);
}

function info(message) {
  console.log("    - " + message);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error("断言失败：" + message);
  }
}

function maskSecret(value) {
  if (value.length <= 8) {
    return "***";
  }
  return value.slice(0, 4) + "***" + value.slice(-2);
}

function cookiePairOf(response) {
  const raw =
    typeof response.headers.getSetCookie === "function"
      ? (response.headers.getSetCookie() ?? []).join("\n")
      : (response.headers.get("set-cookie") ?? "");
  const first = raw.split("\n").find((line) => line.trim().length > 0) ?? "";
  const pair = first.split(";")[0].trim();
  return pair.length > 0 ? pair : null;
}

async function requestJson(path, options = {}) {
  const { method = "GET", body, cookie } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const headers = {};
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (cookie) {
      headers.Cookie = cookie;
    }

    const response = await fetch(BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    return { status: response.status, payload, text, cookie: cookiePairOf(response) };
  } finally {
    clearTimeout(timer);
  }
}

function expectOk(result, label) {
  const payload = result.payload;
  if (!payload || payload.ok !== true) {
    const detail =
      payload && payload.error
        ? payload.error.code + " / " + payload.error.message
        : result.text.slice(0, 300);
    throw new Error(label + " 失败：HTTP " + result.status + " " + detail);
  }
  return payload.data;
}
function parseSseBlock(block, events, errors) {
  let event = "message";
  const dataLines = [];

  for (const line of block.split("\n")) {
    if (line.startsWith(":")) {
      continue;
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

  let payload;
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    return;
  }

  if (event === "error") {
    errors.push(payload);
  }
  events.push({ event, data: payload });
}

function consumeSseBuffer(buffer, events, errors) {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    if (block.trim().length > 0) {
      parseSseBlock(block, events, errors);
    }
  }
  return rest;
}

async function streamSse(path, body, cookie, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  const events = [];
  const errors = [];

  try {
    const response = await fetch(BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(label + " 开流前失败：HTTP " + response.status + " " + text.slice(0, 300));
    }

    const contentType = response.headers.get("content-type") ?? "";
    assert(
      contentType.includes("text/event-stream"),
      label + " 的 Content-Type 应为 text/event-stream，实际：" + contentType,
    );
    assert(
      (response.headers.get("cache-control") ?? "").includes("no-store"),
      label + " 缺少 Cache-Control: no-store",
    );
    assert(
      (response.headers.get("x-accel-buffering") ?? "").toLowerCase() === "no",
      label + " 缺少 X-Accel-Buffering: no",
    );

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = consumeSseBuffer(buffer, events, errors);
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      consumeSseBuffer(buffer + "\n\n", events, errors);
    }

    return { events, errors };
  } finally {
    clearTimeout(timer);
  }
}

function pickEvents(events, name) {
  return events.filter((item) => item.event === name).map((item) => item.data);
}

function assertNoSseError(errors, label) {
  if (errors.length === 0) {
    return;
  }
  const first = errors[0] ?? {};
  throw new Error(
    label + " 返回 error 事件：" + (first.code ?? "UNKNOWN") + " / " + (first.message ?? ""),
  );
}

function assertProgress(events, label) {
  const progress = pickEvents(events, "progress");
  assert(progress.length >= 1, label + " 应至少推送 1 条 progress 事件");
  for (const item of progress) {
    assert(
      typeof item.chars === "number" && item.chars >= 0,
      label + " 的 progress.chars 应为非负数字",
    );
    assert(
      PROGRESS_PHASES.includes(item.phase),
      label + " 的 progress.phase 不合法：" + item.phase,
    );
  }
  return progress;
}

async function probeUpstream({ apiKey, baseUrl, model }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(baseUrl.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "只回复两个字：可用" }],
        max_tokens: 8,
        temperature: 0,
        stream: false,
      }),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error("上游探活失败：HTTP " + response.status + " " + text.slice(0, 300));
    }

    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }

    const content = payload?.choices?.[0]?.message?.content ?? "";
    assert(typeof content === "string" && content.trim().length > 0, "上游返回内容为空");

    return { reply: content.trim(), totalTokens: payload?.usage?.total_tokens ?? null };
  } finally {
    clearTimeout(timer);
  }
}
async function main() {
  step("读取 .env 与前置校验");
  loadEnvFile();

  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  const upstreamBase = (process.env.OPENAI_BASE_URL ?? "").trim();
  const model = (process.env.OPENAI_MODEL ?? "").trim();
  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();

  assert(databaseUrl.length > 0, "缺少 DATABASE_URL");
  assert(upstreamBase.length > 0, "缺少 OPENAI_BASE_URL");
  assert(model.length > 0, "缺少 OPENAI_MODEL");
  if (ALLOW_PLACEHOLDER_KEY) {
    info("已开启 --allow-placeholder-key：跳过密钥形态校验（仅限本地 mock 上游）");
  } else {
    assert(apiKey.length >= 20, "OPENAI_API_KEY 过短，请先在 .env 填入真实密钥");
    for (const pattern of PLACEHOLDER_PATTERNS) {
      assert(!pattern.test(apiKey), "OPENAI_API_KEY 仍是占位值，请先在 .env 填入真实密钥");
    }
  }

  info("目标站点：" + BASE_URL);
  info("上游：" + upstreamBase + "（model=" + model + "，key=" + maskSecret(apiKey) + "）");
  info("数据库：" + databaseUrl);

  step("本地服务健康检查");
  const health = await requestJson("/api/health");
  assert(health.status === 200, "/api/health 应返回 200，实际 " + health.status);
  info("GET /api/health -> " + health.text.slice(0, 160));

  step("真实上游连通性探活");
  const probe = await probeUpstream({ apiKey, baseUrl: upstreamBase, model });
  info(
    "上游回复：" +
      probe.reply.slice(0, 40) +
      "…（total_tokens=" +
      (probe.totalTokens ?? "n/a") +
      "）",
  );

  step("注册 / 登录 / 会话校验");
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const email = "smoke-" + stamp + "@example.com";
  smokeEmail = email;
  const password = "SmokeTest2026ok";

  const registered = await requestJson("/api/auth/register", {
    method: "POST",
    body: { email, password, nickname: "冒烟测试" },
  });
  const registeredData = expectOk(registered, "注册");
  assert(registered.status === 201, "注册应返回 201，实际 " + registered.status);
  assert(registered.cookie !== null, "注册应下发会话 Cookie");
  info("已注册：" + registeredData.user.email);

  const loggedIn = await requestJson("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  expectOk(loggedIn, "登录");
  const cookie = loggedIn.cookie ?? registered.cookie;
  assert(cookie !== null, "登录应下发会话 Cookie");
  info("登录成功，Cookie 名：" + cookie.split("=")[0]);

  const me = expectOk(await requestJson("/api/auth/me", { cookie }), "读取当前用户");
  assert(me.user.email === email, "/api/auth/me 返回的邮箱与注册邮箱不一致");
  info("会话校验通过：" + me.user.email);

  step("创建账号画像");
  const profileData = expectOk(
    await requestJson("/api/profiles", {
      method: "POST",
      cookie,
      body: {
        name: "冒烟测试账号",
        platform: "xiaohongshu",
        niche: "职场",
        positioning: "用真实案例讲职场沟通的 3 分钟干货",
        followerCount: "860",
        weeklyCapacity: "3",
        goal: "grow",
        targetAudience: "入职 1-3 年的职场新人",
        tone: "professional",
        contentFormats: ["talking", "graphic"],
      },
    }),
    "创建画像",
  );
  const profileId = profileData.profile.id;
  info("画像已创建：" + profileId);

  step("生成选题（真实 SSE）");
  const topicStream = await streamSse(
    "/api/topics/generate",
    { profileId, extraNote: "冒烟测试：面向新手的第一条爆款" },
    cookie,
    "选题生成",
  );
  assertNoSseError(topicStream.errors, "选题生成");
  const topicMeta = pickEvents(topicStream.events, "meta")[0];
  assert(
    topicMeta && topicMeta.count === EXPECTED_TOPIC_COUNT,
    "meta.count 应为 " + EXPECTED_TOPIC_COUNT,
  );
  assert(topicMeta.usage && topicMeta.usage.topic.used >= 1, "meta.usage 应回传已消耗的月额度");
  assertProgress(topicStream.events, "选题生成");

  const topicPayloads = pickEvents(topicStream.events, "topic");
  assert(
    topicPayloads.length === EXPECTED_TOPIC_COUNT,
    "应推送 " + EXPECTED_TOPIC_COUNT + " 条 topic，实际 " + topicPayloads.length,
  );
  for (const item of topicPayloads) {
    assert(item.topic && typeof item.topic.id === "string", "topic 事件缺少 id");
    assert(item.topic.reason.length > 0, "topic 缺少推荐理由");
    assert(item.topic.referenceDirection.length > 0, "topic 缺少参考方向");
  }

  const topicDone = pickEvents(topicStream.events, "done")[0];
  assert(
    topicDone && topicDone.created === EXPECTED_TOPIC_COUNT,
    "done.created 应为 " + EXPECTED_TOPIC_COUNT,
  );
  const topics = topicPayloads.map((item) => item.topic);
  info(
    "生成 " +
      topics.length +
      " 条选题，耗时 " +
      topicDone.latencyMs +
      "ms，首条：" +
      topics[0].title,
  );

  step("生成脚本（真实 SSE）");
  const scriptStream = await streamSse(
    "/api/scripts/generate",
    { topicId: topics[0].id, durationSec: 60, extraNote: "前三秒要有反常识钩子" },
    cookie,
    "脚本生成",
  );
  assertNoSseError(scriptStream.errors, "脚本生成");
  assertProgress(scriptStream.events, "脚本生成");

  const scriptPayload = pickEvents(scriptStream.events, "script")[0];
  assert(scriptPayload && scriptPayload.script, "缺少 script 事件");
  const script = scriptPayload.script;
  assert(Array.isArray(script.titles) && script.titles.length >= 1, "脚本应至少含 1 个标题候选");
  assert(Array.isArray(script.outline) && script.outline.length >= 1, "脚本应含分段口播");
  assert(
    typeof script.fullScript === "string" && script.fullScript.length > 0,
    "脚本应能派生完整口播稿",
  );

  const scriptDone = pickEvents(scriptStream.events, "done")[0];
  assert(scriptDone && scriptDone.scriptId === script.id, "done.scriptId 与 script.id 不一致");
  info(
    "脚本已生成：" +
      script.id +
      "，标题候选 " +
      script.titles.length +
      " 个，分段 " +
      script.outline.length +
      " 段",
  );

  step("录入作品数据");
  const postInputs = [
    {
      title: "入职 3 个月最该学会的沟通话术",
      publishedAt: "2026-08-26",
      views: 3200,
      likes: 210,
      comments: 32,
      saves: 96,
      shares: 18,
      followsGained: 45,
      completionRate: 0.35,
      scriptId: script.id,
    },
    {
      title: "为什么你的汇报总被打断",
      publishedAt: "2026-09-02",
      views: 1800,
      likes: 96,
      comments: 12,
      saves: 41,
      shares: 6,
      followsGained: 14,
      completionRate: 0.28,
    },
    {
      title: "被领导否定后，我这样回应",
      publishedAt: "2026/9/8",
      views: 5600,
      likes: 420,
      comments: 58,
      saves: 173,
      shares: 39,
      followsGained: 88,
      completionRate: 0.42,
    },
  ];

  const postIds = [];
  for (const input of postInputs) {
    const created = expectOk(
      await requestJson("/api/posts", { method: "POST", cookie, body: input }),
      "录入作品",
    );
    assert(created.post && typeof created.post.id === "string", "录入作品未返回 id");
    postIds.push(created.post.id);
  }
  info("已录入 " + postIds.length + " 条作品（含 2026/9/8 这类斜杠日期）");
  step("生成复盘报告（真实 SSE）");
  const reviewStream = await streamSse(
    "/api/reviews/generate",
    { postIds, focus: "重点看标题与开头钩子对完播与涨粉的影响" },
    cookie,
    "复盘生成",
  );
  assertNoSseError(reviewStream.errors, "复盘生成");
  assertProgress(reviewStream.events, "复盘生成");

  const reviewPayload = pickEvents(reviewStream.events, "review")[0];
  assert(reviewPayload && reviewPayload.review, "缺少 review 事件");
  const review = reviewPayload.review;
  assert(
    typeof review.summary === "string" && review.summary.trim().length > 0,
    "复盘缺少结论摘要",
  );
  assert(
    Array.isArray(review.suggestions) && review.suggestions.length >= 1,
    "复盘应给出下一步建议",
  );
  assert(
    Array.isArray(review.posts) && review.posts.length === postIds.length,
    "报告快照应包含全部纳入的作品",
  );
  // 基线只用「本次未纳入的历史作品」：全新账号没有历史，样本数必然为 0
  assert(review.sampleSize === 0, "全新账号的基线样本应为 0，实际 " + review.sampleSize);

  const reviewDone = pickEvents(reviewStream.events, "done")[0];
  assert(reviewDone && typeof reviewDone.reviewId === "string", "done 缺少 reviewId");
  info("复盘已生成：" + reviewDone.reviewId + "，纳入 " + review.posts.length + " 条作品");

  step("用量与落库校验");
  const usage = expectOk(await requestJson("/api/usage", { cookie }), "读取用量").usage;
  for (const kind of QUOTA_KINDS) {
    assert(usage.month[kind].used >= 1, kind + " 月额度应至少消耗 1 次");
  }
  assert(usage.day.aiDaily.used >= 3, "日额度应至少消耗 3 次");
  info(
    "月用量：topic=" +
      usage.month.topic.used +
      " script=" +
      usage.month.script.used +
      " review=" +
      usage.month.review.used +
      "；日用量=" +
      usage.day.aiDaily.used +
      "/" +
      usage.day.aiDaily.limit,
  );

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    assert(user !== null, "数据库里应存在冒烟用户");
    const userId = user.id;

    const counts = {
      topics: await prisma.topicIdea.count({ where: { userId } }),
      scripts: await prisma.script.count({ where: { userId } }),
      posts: await prisma.postRecord.count({ where: { userId } }),
      reviews: await prisma.reviewReport.count({ where: { userId } }),
      logs: await prisma.aiCallLog.count({ where: { userId } }),
      counters: await prisma.usageCounter.count({ where: { userId } }),
    };

    assert(
      counts.topics === EXPECTED_TOPIC_COUNT,
      "TopicIdea 应为 " + EXPECTED_TOPIC_COUNT + " 条，实际 " + counts.topics,
    );
    assert(counts.scripts >= 1, "Script 应至少 1 条");
    assert(
      counts.posts === postInputs.length,
      "PostRecord 应为 " + postInputs.length + " 条，实际 " + counts.posts,
    );
    assert(counts.reviews >= 1, "ReviewReport 应至少 1 条");
    assert(counts.logs >= 3, "AiCallLog 应至少 3 条");
    assert(counts.counters >= 4, "UsageCounter 应至少 4 行（3 个月额度 + 1 个日额度）");

    for (const kind of QUOTA_KINDS) {
      const okLogs = await prisma.aiCallLog.count({ where: { userId, kind, status: "ok" } });
      assert(okLogs >= 1, kind + " 应至少有 1 条 status=ok 的 AiCallLog");
    }

    const snapshotLocked = await prisma.topicIdea.count({
      where: { userId, NOT: { profileSnapshot: "{}" } },
    });
    assert(snapshotLocked === EXPECTED_TOPIC_COUNT, "选题应锁定生成时的画像快照");

    info(
      "落库：topics=" +
        counts.topics +
        " scripts=" +
        counts.scripts +
        " posts=" +
        counts.posts +
        " reviews=" +
        counts.reviews +
        " aiCallLogs=" +
        counts.logs +
        " usageCounters=" +
        counts.counters,
    );

    if (KEEP_ACCOUNT) {
      info("--keep 已开启，保留测试账号：" + email);
    } else {
      step("注销账号与级联清理");
      expectOk(
        await requestJson("/api/account", {
          method: "DELETE",
          cookie,
          body: { password, confirm: "注销账号" },
        }),
        "注销账号",
      );

      const remaining = {
        users: await prisma.user.count({ where: { id: userId } }),
        sessions: await prisma.session.count({ where: { userId } }),
        profiles: await prisma.creatorProfile.count({ where: { userId } }),
        topics: await prisma.topicIdea.count({ where: { userId } }),
        scripts: await prisma.script.count({ where: { userId } }),
        posts: await prisma.postRecord.count({ where: { userId } }),
        reviews: await prisma.reviewReport.count({ where: { userId } }),
        aiCallLogs: await prisma.aiCallLog.count({ where: { userId } }),
        usageCounters: await prisma.usageCounter.count({ where: { userId } }),
      };

      for (const [name, value] of Object.entries(remaining)) {
        assert(value === 0, "注销后 " + name + " 应为 0，实际 " + value);
      }

      info("注销后 9 类关联数据均已级联删除，无残留");
      smokeEmail = null;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n真实冒烟通过：注册 → 画像 → 选题 → 脚本 → 作品 → 复盘 → 注销 全链路可用 ✔");
}

async function cleanupFailedRun() {
  if (KEEP_ACCOUNT || smokeEmail === null) {
    return;
  }

  const prisma = new PrismaClient();
  try {
    const deleted = await prisma.user.deleteMany({ where: { email: smokeEmail } });
    if (deleted.count > 0) {
      console.log("已清理本次失败运行的测试账号：" + smokeEmail);
    }
  } catch (error) {
    console.error("清理测试账号失败：" + (error instanceof Error ? error.message : String(error)));
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch(async (error) => {
    console.error("\n真实冒烟失败：" + (error instanceof Error ? error.message : String(error)));
    await cleanupFailedRun();
    process.exitCode = 1;
  });
