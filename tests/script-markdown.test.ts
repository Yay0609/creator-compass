import { describe, expect, it } from "vitest";

import { safeFileName } from "@/lib/client/download";
import { escapeTableCell, scriptToMarkdown, toInlineText } from "@/lib/scripts/markdown";
import type { ScriptDto } from "@/lib/scripts/schemas";

/** P5：Markdown 分镜表导出（纯函数，无网络与 DOM 依赖）。 */

const SCRIPT: ScriptDto = {
  id: "s1",
  batchId: "b1",
  topicId: null,
  topicTitle: null,
  titles: ["新手第一支视频怎么拍", "三个动作提升完播率"],
  title: "新手第一支视频怎么拍",
  hook: "你是不是也觉得\n第一支视频最难？",
  outline: [
    { section: "开场", seconds: 10, content: "先说结论", visual: "大字报" },
    { section: "正文", seconds: 30, content: "含|竖线\n和换行", visual: "" },
  ],
  tags: ["新手", "复盘"],
  coverCopy: "封面文案",
  cta: "关注我",
  fullScript: "完整口播稿内容",
  totalSeconds: 40,
  platform: "xiaohongshu",
  source: "ai",
  model: "gpt-4o-mini",
  isFavorite: false,
  isDiscarded: false,
  editedAt: null,
  createdAt: "2026-09-13T08:00:00.000Z",
  updatedAt: "2026-09-13T08:00:00.000Z",
};

describe("scriptToMarkdown", () => {
  const markdown = scriptToMarkdown(SCRIPT);

  it("包含标题、时长与分镜表头", () => {
    expect(markdown).toContain("# 新手第一支视频怎么拍");
    expect(markdown).toContain("## 分镜脚本");
    expect(markdown).toContain("| 镜号 | 段落 | 时长 | 口播内容 | 画面 / 字幕 |");
    expect(markdown).toContain("总时长 40 秒");
  });

  it("分段按顺序编号，字数与画面缺失时用占位符", () => {
    expect(markdown).toContain("| 1 | 开场 | 10 秒 | 先说结论 | 大字报 |");
    expect(markdown).toContain("| 2 | 正文 | 30 秒 | 含\\|竖线 和换行 | — |");
  });

  it("标签与结尾引导按 Markdown 结构输出", () => {
    expect(markdown).toContain("## 标签");
    expect(markdown).toContain("#新手 #复盘");
    expect(markdown).toContain("## 结尾引导");
    expect(markdown).toContain("关注我");
  });

  it("标题候选按有序列表输出，钩子里的换行被折叠", () => {
    expect(markdown).toContain("1. 新手第一支视频怎么拍");
    expect(markdown).toContain("2. 三个动作提升完播率");
    expect(markdown).toContain("你是不是也觉得 第一支视频最难？");
  });

  it("可以关闭完整口播稿", () => {
    const withoutFull = scriptToMarkdown(SCRIPT, { includeFullScript: false });
    expect(withoutFull).not.toContain("## 完整口播稿");
    expect(markdown).toContain("## 完整口播稿");
  });

  it("没有分段时给出占位行，不产生空表", () => {
    const empty = scriptToMarkdown({ ...SCRIPT, outline: [], totalSeconds: 0 });
    expect(empty).toContain("| — | — | — | 暂无分段 | — |");
    expect(empty).toContain("总时长 —");
  });
});

describe("转义与文件名", () => {
  it("表格竖线与换行被转义", () => {
    expect(escapeTableCell("a|b")).toBe("a\\|b");
    expect(escapeTableCell("a\nb")).toBe("a b");
    expect(toInlineText("a\nb")).toBe("a b");
  });

  it("文件名去掉非法字符并保留中文", () => {
    expect(safeFileName("新手/第一支:视频*怎么拍?")).toBe("新手-第一支-视频-怎么拍-");
    expect(safeFileName("   ")).toBe("export");
    expect(safeFileName("a".repeat(200)).length).toBe(60);
  });
});
