import "server-only";

import type { ChatMessage } from "@/lib/ai/provider";
import { AI_PROMPT_VERSION, TOPIC_BATCH_SIZE } from "@/lib/constants";

/**
 * 选题提示词。纯字符串拼装，不依赖数据库，便于单测与回归对比。
 * 修改提示词时请同步更新 AI_PROMPT_VERSION。
 */
export type TopicPromptContext = {
  platformLabel: string;
  niche: string;
  subNiche: string | null;
  positioning: string | null;
  targetAudience: string | null;
  tone: string | null;
  followerCount: number | null;
  weeklyCapacity: number | null;
  goalLabel: string | null;
  contentFormats: string[];
  extraNote: string | null;
  excludeTitles: string[];
};

export const TOPIC_SYSTEM_PROMPT = `你是「创作罗盘」的选题策划，服务对象是小红书 / B站 / 抖音上 0–1 万粉的新手创作者。

你的任务：结合账号画像，给出 ${TOPIC_BATCH_SIZE} 条「今天就能开拍」的选题。

硬性要求：
1. 只输出 JSON，不要解释文字，不要 Markdown 围栏。
2. 结构固定为 {"items": [ ... ]}，items 必须恰好 ${TOPIC_BATCH_SIZE} 条。
3. 每条字段与含义：
   - title：可直接当标题用的选题名，≤ 40 字；要具体、有画面感，避免「关于 XX 的思考」这类空泛表述
   - angle：这条选题的切入角度，≤ 80 字
   - reason：为什么适合这个账号（结合画像与粉丝量级），≤ 300 字
   - referenceDirection：可执行的参考方向（拍什么、怎么拍、结构如何），≤ 300 字
   - keywords：3–6 个关键词，用于平台搜索与打标签
   - score：0–100 的整数，表示「对该账号的推荐优先级」，不是热度数字
   - difficulty：制作难度，只能是 low / medium / high
4. 不要编造播放量、涨粉数、热度指数等具体数据；不要引用你无法确认的实时热点。
5. 不要建议刷量、搬运、洗稿、诱导互动等违规玩法；涉及广告、绝对化用语等合规风险时，在 referenceDirection 中提醒。
6. 全部使用简体中文。

（prompt ${AI_PROMPT_VERSION}）`;

function line(label: string, value: string | null): string {
  const text = value?.trim() ?? "";
  return `- ${label}：${text.length > 0 ? text : "未填写"}`;
}

export function buildTopicUserPrompt(context: TopicPromptContext): string {
  const parts: string[] = ["【账号画像】"];

  parts.push(line("平台", context.platformLabel));
  parts.push(
    line(
      "赛道",
      context.subNiche ? `${context.niche}（细分方向：${context.subNiche}）` : context.niche,
    ),
  );
  parts.push(line("一句话人设", context.positioning));
  parts.push(line("目标人群", context.targetAudience));
  parts.push(line("语言风格", context.tone));
  parts.push(
    line("当前粉丝量", context.followerCount === null ? null : String(context.followerCount)),
  );
  parts.push(
    line("每周可产出", context.weeklyCapacity === null ? null : `${context.weeklyCapacity} 条`),
  );
  parts.push(line("目标", context.goalLabel));
  parts.push(
    line(
      "常用内容形式",
      context.contentFormats.length > 0 ? context.contentFormats.join("、") : null,
    ),
  );

  if (context.extraNote && context.extraNote.trim().length > 0) {
    parts.push("", "【本次补充说明】", context.extraNote.trim());
  }

  if (context.excludeTitles.length > 0) {
    parts.push("", "【已生成过的标题（本次必须避开，不要重复或高度近似）】");
    for (const title of context.excludeTitles) {
      parts.push(`- ${title}`);
    }
  }

  parts.push("", `请输出恰好 ${TOPIC_BATCH_SIZE} 条选题的 JSON。`);

  return parts.join("\n");
}

export function buildTopicMessages(context: TopicPromptContext): ChatMessage[] {
  return [
    { role: "system", content: TOPIC_SYSTEM_PROMPT },
    { role: "user", content: buildTopicUserPrompt(context) },
  ];
}

/** 校验失败后的修复调用：把上一次输出与具体问题一并回传，要求只输出 JSON。 */
export function buildTopicRepairMessages(
  context: TopicPromptContext,
  previousText: string,
  issues: string[],
): ChatMessage[] {
  const repairInstruction = [
    "你上一次的输出无法通过校验，问题如下：",
    ...issues.map((issue) => `- ${issue}`),
    "",
    `请重新输出完整 JSON（恰好 ${TOPIC_BATCH_SIZE} 条），只输出 JSON，不要任何解释文字。`,
  ].join("\n");

  return [
    { role: "system", content: TOPIC_SYSTEM_PROMPT },
    { role: "user", content: buildTopicUserPrompt(context) },
    { role: "assistant", content: previousText.slice(0, 4_000) },
    { role: "user", content: repairInstruction },
  ];
}
