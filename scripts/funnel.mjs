#!/usr/bin/env node
/**
 * 漏斗统计脚本（P5）。
 *
 * 用法：
 *   node scripts/funnel.mjs                     # 统计全部历史
 *   node scripts/funnel.mjs --since=2026-09-01  # 只看该日期之后注册的用户
 *
 * 口径：见 src/lib/metrics/funnel.ts 与 AGENTS.md 第 12 节。
 * 只输出聚合数字，不导出任何用户明细，也不上报第三方。
 */

import { PrismaClient } from "@prisma/client";

import { loadEnvFile } from "./load-env.mjs";

const STEPS = [
  { key: "register", label: "注册" },
  { key: "topic", label: "生成选题" },
  { key: "script", label: "生成脚本" },
  { key: "post", label: "录入数据" },
  { key: "review", label: "生成复盘" },
];

const PERCENT = String.fromCharCode(37);

function percent(value) {
  return value === null ? "—" : (value * 100).toFixed(1) + PERCENT;
}

function parseSince() {
  const arg = process.argv.slice(2).find((item) => item.startsWith("--since="));
  if (!arg) {
    return null;
  }

  const raw = arg.slice("--since=".length);
  const parsed = new Date(raw + "T00:00:00+08:00");

  if (Number.isNaN(parsed.getTime())) {
    console.error("--since 需要形如 2026-09-01 的日期。");
    process.exitCode = 1;
    return undefined;
  }

  return parsed;
}

async function main() {
  loadEnvFile();

  const since = parseSince();
  if (since === undefined) {
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("缺少 DATABASE_URL：请在项目根目录的 .env 中配置后再运行。");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();

  try {
    const createdAt = since ? { gte: since } : undefined;

    const counts = await Promise.all([
      prisma.user.count({ where: { createdAt } }),
      prisma.user.count({ where: { createdAt, topicIdeas: { some: { isDiscarded: false } } } }),
      prisma.user.count({ where: { createdAt, scripts: { some: { isDiscarded: false } } } }),
      prisma.user.count({ where: { createdAt, posts: { some: {} } } }),
      prisma.user.count({ where: { createdAt, reviews: { some: { isDiscarded: false } } } }),
    ]);

    console.log("创作罗盘 · 核心漏斗");
    console.log("统计范围：" + (since ? since.toISOString() : "全部历史"));
    console.log("");

    let biggest = null;

    STEPS.forEach((step, index) => {
      const users = counts[index] ?? 0;
      const previous = index === 0 ? null : counts[index - 1] ?? 0;
      const first = counts[0] ?? 0;

      const line =
        "[" + (index + 1) + "] " + step.label.padEnd(6, " ") +
        " " + String(users).padStart(6, " ") + " 人" +
        "   环比 " + percent(previous === null ? null : previous === 0 ? null : users / previous) +
        "   占注册 " + percent(index === 0 || first === 0 ? null : users / first);

      console.log(line);

      if (previous !== null) {
        const lost = previous - users;
        if (lost > 0 && (biggest === null || lost > biggest.lost)) {
          biggest = { from: STEPS[index - 1].label, to: step.label, lost };
        }
      }
    });

    console.log("");
    console.log(
      biggest === null
        ? "没有出现流失：每一步都不少于上一步。"
        : "流失最大：" + biggest.from + " -> " + biggest.to + "（流失 " + biggest.lost + " 人）",
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
