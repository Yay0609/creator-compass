import "server-only";

import { prisma } from "@/lib/db/prisma";

/**
 * 埋点：派生漏斗（P5）。
 *
 * 设计取舍：不新建事件表、不上报第三方、不记录设备/IP/UA。
 * 五步漏斗全部由既有表派生，因此可以回溯 P1-P4 的历史用户，
 * 也不会在 P2-P4 已稳定的服务里插入埋点写入逻辑。
 *
 * 口径（写进 AGENTS.md）：
 * - 每一步都统计「满足条件的独立用户数」
 * - 已忽略（isDiscarded）的选题 / 脚本 / 复盘不计入
 * - since 用来限定注册时间窗口；不传则统计全部历史
 */

export const FUNNEL_STEPS = ["register", "topic", "script", "post", "review"] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const FUNNEL_STEP_LABEL: Record<FunnelStep, string> = {
  register: "注册",
  topic: "生成选题",
  script: "生成脚本",
  post: "录入数据",
  review: "生成复盘",
};

export type FunnelRow = {
  step: FunnelStep;
  label: string;
  users: number;
  /** 相对上一步的转化率（0-1）；第一步或分母为 0 时为 null */
  conversionFromPrevious: number | null;
  /** 相对注册的转化率（0-1）；第一步或分母为 0 时为 null */
  conversionFromFirst: number | null;
};

export type FunnelDrop = { from: FunnelStep; to: FunnelStep; lost: number };

export type Funnel = {
  since: string | null;
  steps: FunnelRow[];
  /** 流失人数最多的一步，用来定位最该优化的环节 */
  biggestDrop: FunnelDrop | null;
};

/** 纯函数：把各步人数换算成带转化率的漏斗行。 */
export function buildFunnel(counts: readonly number[]): FunnelRow[] {
  const first = counts[0] ?? 0;

  return FUNNEL_STEPS.map((step, index) => {
    const users = counts[index] ?? 0;
    const previous = index === 0 ? null : counts[index - 1] ?? 0;

    return {
      step,
      label: FUNNEL_STEP_LABEL[step],
      users,
      conversionFromPrevious: previous === null || previous === 0 ? null : users / previous,
      conversionFromFirst: index === 0 || first === 0 ? null : users / first,
    };
  });
}

/** 纯函数：找出流失人数最多的一步。 */
export function biggestDropOf(rows: readonly FunnelRow[]): FunnelDrop | null {
  let worst: FunnelDrop | null = null;

  for (let index = 1; index < rows.length; index += 1) {
    const current = rows[index];
    const previous = rows[index - 1];
    if (!current || !previous) {
      continue;
    }

    const lost = previous.users - current.users;
    if (lost <= 0) {
      continue;
    }

    if (worst === null || lost > worst.lost) {
      worst = { from: previous.step, to: current.step, lost };
    }
  }

  return worst;
}

/** 查询数据库并返回完整漏斗。 */
export async function getFunnel(options?: { since?: Date }): Promise<Funnel> {
  const createdAt = options?.since ? { gte: options.since } : undefined;

  const [registered, topics, scripts, posts, reviews] = await Promise.all([
    prisma.user.count({ where: { createdAt } }),
    prisma.user.count({ where: { createdAt, topicIdeas: { some: { isDiscarded: false } } } }),
    prisma.user.count({ where: { createdAt, scripts: { some: { isDiscarded: false } } } }),
    prisma.user.count({ where: { createdAt, posts: { some: {} } } }),
    prisma.user.count({ where: { createdAt, reviews: { some: { isDiscarded: false } } } }),
  ]);

  const steps = buildFunnel([registered, topics, scripts, posts, reviews]);

  return {
    since: options?.since ? options.since.toISOString() : null,
    steps,
    biggestDrop: biggestDropOf(steps),
  };
}
