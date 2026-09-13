import "server-only";

import type { ChatMessage } from "@/lib/ai/provider";
import {
  SCRIPT_OUTLINE_MAX,
  SCRIPT_OUTLINE_MIN,
  SCRIPT_PROMPT_VERSION,
  SCRIPT_TITLES_MAX,
  SCRIPT_TITLES_MIN,
} from "@/lib/constants";

/**
 * 脚本提示词。纯字符串拼装，不依赖数据库，便于单测与回归对比。
 * 修改提示词时请同步更新 SCRIPT_PROMPT_VERSION。
 */
export type ScriptPromptContext = {
  platformLabel: string;
  niche: string;
  subNiche: string | null;
  positioning: string | null;
  targetAudience: string | null;
  tone: string | null;
  followerCount: number | null;
  goalLabel: string | null;
  contentFormats: string[];
  topicTitle: string | null;
  topicAngle: string | null;
  topicReason: string | null;
  topicKeywords: string[];
  extraNote: string | null;
  durationSec: number;
};

export const SCRIPT_SYSTEM_PROMPT = `你是「创作罗盘」的短视频脚本策划，服务对象是小红书 / B站 / 抖音上 0–1 万粉的新手创作者。

你的任务：把一个已经定好的选题，写成「拿起手机就能拍」的成品脚本。

硬性要求：
1. 只输出 JSON，不要解释文字，不要 Markdown 围栏。
2. 输出结构固定为：
   {
     "titles": ["标题候选，${SCRIPT_TITLES_MIN}–${SCRIPT_TITLES_MAX} 个，每个 ≤ 40 字"],
     "hook": "开头 3 秒钩子，≤ 200 字",
     "outline": [
       { "section": "段落标题，≤ 40 字", "seconds": 15, "content": "这一段的口播稿", "visual": "画面 / 字幕提示" }
     ],
     "tags": ["标签，3–10 个，每个 ≤ 24 字"],
     "coverCopy": "封面文案，≤ 40 字",
     "cta": "结尾引导，≤ 120 字（可选）"
   }
3. outline 必须 ${SCRIPT_OUTLINE_MIN}–${SCRIPT_OUTLINE_MAX} 段，按口播顺序排列；每段：
   - section：段落标题（如「开场钩子」「痛点展开」「方法一」），≤ 40 字
   - seconds：该段预计时长（整数秒，3–300），各段相加要接近给定的目标时长
   - content：这一段的完整口播稿，可以直接照读，禁止出现「此处展开」「自行补充」这类占位
   - visual：画面或字幕提示（可选，但建议给出）
4. titles 必须给出不同角度的候选（悬念 / 数字 / 反常识 / 痛点 / 身份代入），不要只是同一句话改标点。
5. 不要编造播放量、涨粉数、热度指数等具体数据；不要承诺收益、健康或财富结果。
6. 不要建议刷量、搬运、洗稿、诱导互动等违规玩法；涉及广告、绝对化用语、医疗与金融建议时，在 content 中做合规提醒。
7. 全部使用简体中文。

（prompt ${SCRIPT_PROMPT_VERSION}）`;

function line(label: string, value: string | null): string {
  const text = value?.trim() ?? "";
  return `- ${label}：${text.length > 0 ? text : "未填写"}`;
}

/** 目标时长对应的大致口播字数（按中文口播每分钟约 240 字估算）。 */
function spokenCharsHint(durationSec: number): string {
  const perMinute = 240;
  const low = Math.round((durationSec / 60) * perMinute * 0.85);
  const high = Math.round((durationSec / 60) * perMinute * 1.15);
  return `约 ${low}–${high} 字`;
}

export function buildScriptUserPrompt(context: ScriptPromptContext): string {
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
  parts.push(line("目标", context.goalLabel));
  parts.push(
    line(
      "常用内容形式",
      context.contentFormats.length > 0 ? context.contentFormats.join("、") : null,
    ),
  );

  parts.push("", "【本次选题】");
  if (context.topicTitle) {
    parts.push(line("选题", context.topicTitle));
  }
  parts.push(line("切入角度", context.topicAngle));
  parts.push(line("推荐理由", context.topicReason));
  parts.push(
    line("关键词", context.topicKeywords.length > 0 ? context.topicKeywords.join("、") : null),
  );

  parts.push(
    "",
    "【目标时长】",
    `${context.durationSec} 秒（口播全文${spokenCharsHint(context.durationSec)}）`,
  );

  if (context.extraNote && context.extraNote.trim().length > 0) {
    parts.push("", "【本次补充说明】", context.extraNote.trim());
  }

  parts.push(
    "",
    `请输出 JSON：{"titles": [...], "hook": "...", "outline": [...], "tags": [...], "coverCopy": "...", "cta": "..."}`,
  );

  return parts.join("\n");
}

export function buildScriptMessages(context: ScriptPromptContext): ChatMessage[] {
  return [
    { role: "system", content: SCRIPT_SYSTEM_PROMPT },
    { role: "user", content: buildScriptUserPrompt(context) },
  ];
}

/** 校验失败后的修复调用：把上一次输出与具体问题一并回传，要求只输出 JSON。 */
export function buildScriptRepairMessages(
  context: ScriptPromptContext,
  previousText: string,
  issues: string[],
): ChatMessage[] {
  const repairInstruction = [
    "你上一次的输出无法通过校验，问题如下：",
    ...issues.map((issue) => `- ${issue}`),
    "",
    "请重新输出完整的 JSON（titles / hook / outline / tags / coverCopy / cta），只输出 JSON，不要任何解释文字。",
  ].join("\n");

  return [
    { role: "system", content: SCRIPT_SYSTEM_PROMPT },
    { role: "user", content: buildScriptUserPrompt(context) },
    { role: "assistant", content: previousText.slice(0, 6_000) },
    { role: "user", content: repairInstruction },
  ];
}