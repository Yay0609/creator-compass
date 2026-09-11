export const APP_NAME = "创作罗盘";

export const APP_DESCRIPTION =
  "面向小红书 / B站 / 抖音 0–1 万粉新手创作者的 AI 选题、脚本与数据复盘助手。";

type Option = { readonly value: string; readonly label: string };

export function optionValues<T extends readonly Option[]>(options: T): T[number]["value"][] {
  return options.map((item) => item.value) as T[number]["value"][];
}

export function optionLabel(options: readonly Option[], value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return options.find((item) => item.value === value)?.label ?? value;
}

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

export const GOALS = [
  { value: "grow", label: "涨粉走红" },
  { value: "monetize", label: "接商单变现" },
  { value: "sell", label: "给自营生意引流" },
  { value: "record", label: "记录与表达" },
  { value: "learn", label: "练习与成长" },
] as const;

export const TONES = [
  { value: "friendly", label: "亲切" },
  { value: "professional", label: "专业" },
  { value: "sharp", label: "犀利" },
  { value: "funny", label: "沙雕" },
  { value: "healing", label: "治愈" },
] as const;

export const CONTENT_FORMATS = [
  { value: "graphic", label: "图文" },
  { value: "talking", label: "口播" },
  { value: "vlog", label: "Vlog" },
  { value: "tutorial", label: "教程 / 干货" },
  { value: "review", label: "测评" },
] as const;

export const AI_FEATURES = ["topic", "script", "review"] as const;

export type AiFeature = (typeof AI_FEATURES)[number];