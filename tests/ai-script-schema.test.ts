import { describe, expect, it } from "vitest";

import {
  buildScriptDraft,
  scriptOutputSchema,
} from "@/lib/ai/schemas/script";
import {
  SCRIPT_DURATION_MAX_SEC,
  SCRIPT_DURATION_MIN_SEC,
  SCRIPT_OUTLINE_MAX,
  SCRIPT_TITLES_MAX,
} from "@/lib/constants";
import {
  decodeScriptCursor,
  encodeScriptCursor,
  generateScriptSchema,
  saveScriptSchema,
  updateScriptSchema,
} from "@/lib/scripts/schemas";

function validOutlineItem(index: number) {
  return {
    section: `第 ${index + 1} 段`,
    seconds: 15,
    content: `第 ${index + 1} 段的口播稿`,
    visual: "出镜 + 字幕",
  };
}

function validScript() {
  return {
    titles: ["标题一", "标题二", "标题三"],
    hook: "开头钩子",
    outline: [validOutlineItem(0), validOutlineItem(1), validOutlineItem(2)],
    tags: ["标签一", "标签二", "标签三"],
    coverCopy: "封面文案",
    cta: "关注我",
  };
}

describe("脚本 AI 输出契约", () => {
  it("合法脚本通过校验", () => {
    expect(scriptOutputSchema.safeParse(validScript()).success).toBe(true);
  });

  it("标题候选少于 3 个时校验失败", () => {
    const result = scriptOutputSchema.safeParse({ ...validScript(), titles: ["只有一个"] });
    expect(result.success).toBe(false);
  });

  it("标题候选超过 5 个时校验失败", () => {
    const titles = Array.from({ length: SCRIPT_TITLES_MAX + 1 }, (_, index) => `标题 ${index}`);
    expect(scriptOutputSchema.safeParse({ ...validScript(), titles }).success).toBe(false);
  });

  it("分段少于 3 段或超过 8 段时校验失败", () => {
    const two = [validOutlineItem(0), validOutlineItem(1)];
    expect(scriptOutputSchema.safeParse({ ...validScript(), outline: two }).success).toBe(false);

    const tooMany = Array.from({ length: SCRIPT_OUTLINE_MAX + 1 }, (_, index) =>
      validOutlineItem(index),
    );
    expect(scriptOutputSchema.safeParse({ ...validScript(), outline: tooMany }).success).toBe(false);
  });

  it("钩子为空、标签超过 10 个、封面文案超过 40 字都会失败", () => {
    expect(scriptOutputSchema.safeParse({ ...validScript(), hook: "" }).success).toBe(false);

    const tags = Array.from({ length: 11 }, (_, index) => `标签${index}`);
    expect(scriptOutputSchema.safeParse({ ...validScript(), tags }).success).toBe(false);

    expect(
      scriptOutputSchema.safeParse({ ...validScript(), coverCopy: "字".repeat(41) }).success,
    ).toBe(false);
  });

  it("cta 可选，时长必须是整数秒", () => {
    const withoutCta = { ...validScript() } as Record<string, unknown>;
    delete withoutCta["cta"];
    expect(scriptOutputSchema.safeParse(withoutCta).success).toBe(true);

    const outline = [
      { ...validOutlineItem(0), seconds: 15.5 },
      validOutlineItem(1),
      validOutlineItem(2),
    ];
    expect(scriptOutputSchema.safeParse({ ...validScript(), outline }).success).toBe(false);
  });
});

describe("脚本降级草稿", () => {
  it("无法解析时给出一份带来源选题标题的空草稿", () => {
    const draft = buildScriptDraft("完全不是 JSON", "来源选题标题");
    expect(draft.titles).toEqual(["来源选题标题"]);
    expect(draft.hook).toBe("");
    expect(draft.outline).toHaveLength(1);
    expect(draft.tags).toEqual([]);
  });

  it("保留模型给到的内容，并把越界时长钳制到合法区间", () => {
    const draft = buildScriptDraft(
      JSON.stringify({
        titles: ["只有标题"],
        outline: [{ section: "开场", seconds: 9999, content: "内容" }],
      }),
      null,
    );

    expect(draft.titles).toEqual(["只有标题"]);
    expect(draft.outline[0]?.seconds).toBe(900);
    expect(draft.outline[0]?.visual).toBe("");
  });

  it("嵌套在 data / script 字段里的内容同样能识别", () => {
    const draft = buildScriptDraft(JSON.stringify({ script: { hook: "嵌套钩子" } }), null);
    expect(draft.hook).toBe("嵌套钩子");
    expect(draft.titles).toEqual([]);
  });
});

describe("脚本接口入参契约", () => {
  it("topicId 与 title 至少要有一个", () => {
    expect(generateScriptSchema.safeParse({}).success).toBe(false);
    expect(generateScriptSchema.safeParse({ topicId: "t1" }).success).toBe(true);
    expect(generateScriptSchema.safeParse({ title: "手填标题" }).success).toBe(true);
  });

  it("未知字段被拒绝（strict）", () => {
    expect(generateScriptSchema.safeParse({ topicId: "t1", unexpected: true }).success).toBe(false);
  });

  it("时长超出 15–600 秒被拒绝", () => {
    expect(generateScriptSchema.safeParse({ topicId: "t1", durationSec: SCRIPT_DURATION_MIN_SEC - 1 }).success).toBe(false);
    expect(generateScriptSchema.safeParse({ topicId: "t1", durationSec: SCRIPT_DURATION_MAX_SEC + 1 }).success).toBe(false);
    expect(generateScriptSchema.safeParse({ topicId: "t1", durationSec: 60 }).success).toBe(true);
  });

  it("补充说明超过 200 字被拒绝", () => {
    expect(generateScriptSchema.safeParse({ topicId: "t1", extraNote: "字".repeat(201) }).success).toBe(false);
  });

  it("保存草稿要求至少 1 个非空标题", () => {
    expect(saveScriptSchema.safeParse({ titles: [] }).success).toBe(false);
    expect(saveScriptSchema.safeParse({ titles: ["  "] }).success).toBe(false);
    expect(saveScriptSchema.safeParse({ titles: ["可以保存"] }).success).toBe(true);
  });

  it("更新至少要有一个字段", () => {
    expect(updateScriptSchema.safeParse({}).success).toBe(false);
    expect(updateScriptSchema.safeParse({ isFavorite: true }).success).toBe(true);
    expect(updateScriptSchema.safeParse({ titles: ["新标题"] }).success).toBe(true);
    expect(updateScriptSchema.safeParse({ titles: [] }).success).toBe(false);
  });
});

describe("脚本历史分页游标", () => {
  it("编码后可无损解码", () => {
    const createdAt = new Date("2026-09-13T04:05:06.000Z");
    const cursor = encodeScriptCursor(createdAt, "cs123");
    const decoded = decodeScriptCursor(cursor);
    expect(decoded?.id).toBe("cs123");
    expect(decoded?.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it("非法游标返回 null", () => {
    expect(decodeScriptCursor("garbage")).toBeNull();
    expect(decodeScriptCursor(encodeURIComponent("not-a-date|id"))).toBeNull();
  });
});