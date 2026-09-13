import type { Script } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { toScriptDto } from "@/lib/dto";

function scriptRow(overrides: Partial<Script> = {}): Script {
  return {
    id: "script_1",
    userId: "user_1",
    topicId: "topic_1",
    profileId: "profile_1",
    batchId: "batch_1",
    titles: JSON.stringify(["主标题", "备选标题"]),
    hook: "开头钩子",
    outline: JSON.stringify([
      { section: "开场", seconds: 10, content: "开场内容", visual: "出镜" },
      { section: "正文", seconds: 20, content: "正文内容" },
    ]),
    tags: JSON.stringify(["标签一", "标签二"]),
    coverCopy: "封面文案",
    cta: "关注我",
    platform: "xiaohongshu",
    durationSec: 60,
    source: "ai",
    model: "mock-model",
    topicSnapshot: JSON.stringify({ topicId: "topic_1", title: "来源选题" }),
    profileSnapshot: "{}",
    isFavorite: false,
    isDiscarded: false,
    editedAt: null,
    createdAt: new Date("2026-09-13T00:00:00.000Z"),
    updatedAt: new Date("2026-09-13T00:00:00.000Z"),
    ...overrides,
  };
}

describe("脚本 DTO", () => {
  it("把 JSON 字段解析成结构化数据，并派生完整口播稿与总时长", () => {
    const dto = toScriptDto(scriptRow());

    expect(dto.titles).toEqual(["主标题", "备选标题"]);
    expect(dto.title).toBe("主标题");
    expect(dto.tags).toEqual(["标签一", "标签二"]);
    expect(dto.topicTitle).toBe("来源选题");
    expect(dto.totalSeconds).toBe(30);
    expect(dto.fullScript).toBe("【开场】\n开场内容\n\n【正文】\n正文内容");
    expect(dto.outline[1]?.visual).toBe("");
    expect(dto.editedAt).toBeNull();
  });

  it("数据损坏时退化为空值而不是抛错", () => {
    const dto = toScriptDto(
      scriptRow({
        titles: "不是 JSON",
        outline: "{坏掉的",
        tags: "{}",
        topicSnapshot: "坏掉的",
      }),
    );

    expect(dto.titles).toEqual([]);
    expect(dto.title).toBe("（未命名脚本）");
    expect(dto.outline).toEqual([]);
    expect(dto.tags).toEqual([]);
    expect(dto.topicTitle).toBeNull();
    expect(dto.fullScript).toBe("");
    expect(dto.totalSeconds).toBe(0);
  });

  it("分段里空行被忽略，人工编辑时间会被序列化", () => {
    const dto = toScriptDto(
      scriptRow({
        outline: JSON.stringify([
          { section: "", seconds: 0, content: "", visual: "" },
          { section: "结尾", seconds: 5, content: "收尾", visual: "字幕" },
        ]),
        editedAt: new Date("2026-09-13T01:02:03.000Z"),
        source: "edited",
      }),
    );

    expect(dto.outline).toHaveLength(1);
    expect(dto.totalSeconds).toBe(5);
    expect(dto.fullScript).toBe("【结尾】\n收尾");
    expect(dto.editedAt).toBe("2026-09-13T01:02:03.000Z");
    expect(dto.source).toBe("edited");
  });
});