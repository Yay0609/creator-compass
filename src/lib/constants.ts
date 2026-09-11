export const APP_NAME = "创作罗盘";

export const APP_DESCRIPTION =
  "面向小红书 / B站 / 抖音 0–1 万粉新手创作者的 AI 选题、脚本与数据复盘助手。";

export const PLATFORMS = [
  { value: "xiaohongshu", label: "小红书" },
  { value: "bilibili", label: "B站" },
  { value: "douyin", label: "抖音" },
] as const;

export type Platform = (typeof PLATFORMS)[number]["value"];

export const NICHES = [
  "穿搭",
  "美妆",
  "美食",
  "职场",
  "情感",
  "家居",
  "健身",
  "学习",
  "副业",
  "数码",
  "母婴",
  "旅行",
  "宠物",
] as const;

export type Niche = (typeof NICHES)[number];

export const AI_FEATURES = ["topic", "script", "review"] as const;

export type AiFeature = (typeof AI_FEATURES)[number];