import "server-only";

import type { ChatMessage } from "@/lib/ai/provider";
import { REVIEW_DIMENSIONS } from "@/lib/ai/schemas/review";
import {
  REVIEW_DIAGNOSTICS_MAX,
  REVIEW_DIAGNOSTICS_MIN,
  REVIEW_NEXT_TOPICS_COUNT,
  REVIEW_POINTS_MAX,
  REVIEW_POINTS_MIN,
  REVIEW_PROMPT_VERSION,
  REVIEW_SUGGESTIONS_MAX,
  REVIEW_SUGGESTIONS_MIN,
} from "@/lib/constants";

/**
 * 复盘提示词。纯字符串拼装，不依赖数据库，便于单测与回归对比。
 * 修改提示词时请同步更新 REVIEW_PROMPT_VERSION。
 */

export type ReviewPostContext = {
  title: string;
  /** 发布日期（Asia/Shanghai，YYYY-MM-DD） */
  publishedAt: string;
  platformLabel: string;
  /** 已格式化的指标行，例如 ["曝光 12000", "播放 3200", "互动率 5.2%"] */
  metricLines: string[];
  /** 是否为重点分析对象（单篇复盘时为 true） */
  focus: boolean;
};

export type ReviewBaselineContext = {
  /** 基线样本数（已排除本次纳入的作品） */
  sampleSize: number;
  periodStart: string | null;
  periodEnd: string | null;
  /** 已格式化的基线行，例如 ["播放：均值 1200 / 中位数 900（范围 100–5000，样本 12）"] */
  lines: string[];
};

export type ReviewPromptContext = {
  platformLabel: string;
  niche: string;
  subNiche: string | null;
  positioning: string | null;
  targetAudience: string | null;
  tone: string | null;
  followerCount: number | null;
  goalLabel: string | null;
  /** 常用内容形式（已翻译成中文标签） */
  contentFormats: string[];
  posts: ReviewPostContext[];
  baseline: ReviewBaselineContext;
  focus: string | null;
};

export const REVIEW_SYSTEM_PROMPT = `你是「创作罗盘」的数据复盘分析师，服务对象是小红书 / B站 / 抖音上 0–1 万粉的新手创作者。

你的任务：根据用户手动录入的作品数据，判断「为什么好、为什么不好」，并给出下一步可执行的动作。

硬性要求：
1. 只输出 JSON，不要解释文字，不要 Markdown 围栏。
2. 输出结构固定为：
   {
     "summary": "结论摘要，≤ 300 字",
     "diagnostics": [
       { "dimension": "维度", "verdict": "结论，≤ 80 字", "evidence": "数据依据，≤ 120 字", "suggestion": "改进建议，≤ 120 字" }
     ],
     "highlights": ["做对的地方，≤ 100 字"],
     "problems": ["暴露的问题，≤ 100 字"],
     "suggestions": ["下一步动作，≤ 120 字"],
     "nextTopics": [{ "title": "下一批选题标题，≤ 40 字", "reason": "推荐理由，≤ 120 字" }],
     "baselineNote": "本次对比的口径说明，≤ 120 字"
   }
3. diagnostics 必须 ${REVIEW_DIAGNOSTICS_MIN}–${REVIEW_DIAGNOSTICS_MAX} 条，dimension 只能从以下六项中选：
   ${REVIEW_DIMENSIONS.join(" / ")}
   同一维度不要重复出现；没有足够数据支撑的维度可以不写。
4. highlights ${REVIEW_POINTS_MIN}–${REVIEW_POINTS_MAX} 条，problems ${REVIEW_POINTS_MIN}–${REVIEW_POINTS_MAX} 条，
   suggestions ${REVIEW_SUGGESTIONS_MIN}–${REVIEW_SUGGESTIONS_MAX} 条，
   nextTopics 固定 ${REVIEW_NEXT_TOPICS_COUNT} 条。
5. 所有结论必须引用用户数据中的具体数字（播放、点赞、收藏、涨粉、完播率、对比基线等），
   禁止编造用户没有提供的任何数据、日期或事实；数据不足时明确写「样本不足，暂不下结论」。
6. evidence 必须是「数字 + 对比」，例如「播放 3200，是账号中位数 900 的 3.6 倍」，不要写空话。
7. suggestions 必须是可在下一次更新中直接执行的动作，禁止「多互动」「多发优质内容」这类口号。
8. nextTopics 要结合本期表现给出的方向，标题要具体、可直接使用，不要与本批作品标题重复。
9. 全文字数总和控制在 1200 字以内，避免超出输出长度限制。
10. 不要建议刷量、搬运、洗稿、诱导互动等违规玩法；涉及绝对化用语、医疗与金融建议时给出合规提醒。
11. 全部使用简体中文。

（prompt ${REVIEW_PROMPT_VERSION}）`;
function line(label: string, value: string | null): string {
  const text = value?.trim() ?? "";
  return `- ${label}：${text.length > 0 ? text : "未填写"}`;
}

export function buildReviewUserPrompt(context: ReviewPromptContext): string {
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

  const baseline = context.baseline;
  parts.push("", "【账号基线（来自你的历史作品，已排除本次纳入的作品）】");
  parts.push(
    line("样本数", `${baseline.sampleSize} 条`),
    line(
      "时间范围",
      baseline.periodStart && baseline.periodEnd
        ? `${baseline.periodStart} 至 ${baseline.periodEnd}`
        : null,
    ),
  );

  if (baseline.sampleSize === 0 || baseline.lines.length === 0) {
    parts.push("- 暂无可对比的历史作品，本次只能做作品之间的相对比较，请明确说明样本不足。");
  } else {
    for (const item of baseline.lines) {
      parts.push(`- ${item}`);
    }
  }

  parts.push("", `【本次复盘作品（共 ${context.posts.length} 条）】`);
  context.posts.forEach((post, index) => {
    parts.push(
      "",
      `${index + 1}. ${post.title}${post.focus ? "（重点分析）" : ""}`,
      `   发布日期：${post.publishedAt} ｜ 平台：${post.platformLabel}`,
    );
    for (const metric of post.metricLines) {
      parts.push(`   ${metric}`);
    }
  });

  if (context.focus && context.focus.trim().length > 0) {
    parts.push("", "【本次特别关注】", context.focus.trim());
  }

  parts.push(
    "",
    "请输出 JSON：",
    '{"summary": "...", "diagnostics": [{"dimension": "...", "verdict": "...", "evidence": "...", "suggestion": "..."}], "highlights": ["..."], "problems": ["..."], "suggestions": ["..."], "nextTopics": [{"title": "...", "reason": "..."}], "baselineNote": "..."}',
  );

  return parts.join("\n");
}

export function buildReviewMessages(context: ReviewPromptContext): ChatMessage[] {
  return [
    { role: "system", content: REVIEW_SYSTEM_PROMPT },
    { role: "user", content: buildReviewUserPrompt(context) },
  ];
}

/** 校验失败后的修复调用：把上一次输出与具体问题一并回传，要求只输出 JSON。 */
export function buildReviewRepairMessages(
  context: ReviewPromptContext,
  previousText: string,
  issues: string[],
): ChatMessage[] {
  const repairInstruction = [
    "你上一次的输出无法通过校验，问题如下：",
    ...issues.map((issue) => `- ${issue}`),
    "",
    "请重新输出完整的 JSON（summary / diagnostics / highlights / problems / suggestions / nextTopics / baselineNote），",
    "严格满足条数与字数限制，只输出 JSON，不要任何解释文字。",
  ].join("\n");

  return [
    { role: "system", content: REVIEW_SYSTEM_PROMPT },
    { role: "user", content: buildReviewUserPrompt(context) },
    { role: "assistant", content: previousText.slice(0, 8_000) },
    { role: "user", content: repairInstruction },
  ];
}