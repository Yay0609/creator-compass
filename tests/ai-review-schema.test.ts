import { describe, expect, it } from "vitest";

import {
  buildReviewDraft,
  emptyReviewDraft,
  reviewOutputSchema,
} from "@/lib/ai/schemas/review";

function validPayload() {
  return {
    summary: "本批作品播放低于账号中位数，但收藏率更高。",
    diagnostics: [
      { dimension: "标题", verdict: "标题缺少点开理由", evidence: "播放 1900，中位数 3400", suggestion: "把结论前置" },
      { dimension: "选题", verdict: "选题与主线一致", evidence: "收藏率 3.1%", suggestion: "做成系列" },
      { dimension: "发布节奏", verdict: "间隔不固定", evidence: "两条间隔 2 天", suggestion: "固定每周三条" },
    ],
    highlights: ["收藏率高于中位数"],
    problems: ["播放低于中位数"],
    suggestions: ["标题前 12 个字放结论", "把高收藏选题做成系列", "固定每周更新三条"],
    nextTopics: [
      { title: "选题一", reason: "理由一" },
      { title: "选题二", reason: "理由二" },
      { title: "选题三", reason: "理由三" },
    ],
    baselineNote: "对比账号历史作品的均值与中位数",
  };
}

describe("reviewOutputSchema", () => {
  it("接受结构完整的复盘输出", () => {
    expect(reviewOutputSchema.safeParse(validPayload()).success).toBe(true);
  });

  it("维度必须是固定枚举", () => {
    const payload = validPayload();
    payload.diagnostics[0] = {
      dimension: "玄学",
      verdict: "结论",
      evidence: "依据",
      suggestion: "建议",
    };
    expect(reviewOutputSchema.safeParse(payload).success).toBe(false);
  });

  it("条数不足会被拒绝", () => {
    const payload = validPayload();
    payload.suggestions = ["只有一条"];
    expect(reviewOutputSchema.safeParse(payload).success).toBe(false);

    const payload2 = validPayload();
    payload2.nextTopics = payload2.nextTopics.slice(0, 2);
    expect(reviewOutputSchema.safeParse(payload2).success).toBe(false);
  });
});

describe("buildReviewDraft", () => {
  it("非 JSON 输入也能得到固定结构", () => {
    const draft = buildReviewDraft("抱歉，我直接用文字回答了。");
    expect(draft.summary).toBe("");
    expect(draft.diagnostics).toHaveLength(1);
    expect(draft.nextTopics).toHaveLength(1);
    expect(draft.highlights).toEqual([]);
  });

  it("尽量保留模型已给出的内容", () => {
    const draft = buildReviewDraft(
      JSON.stringify({ summary: "摘要", suggestions: ["建议一", "", "建议二"], diagnostics: [{ dimension: "标题", verdict: "结论" }] }),
    );

    expect(draft.summary).toBe("摘要");
    expect(draft.suggestions).toEqual(["建议一", "建议二"]);
    expect(draft.diagnostics[0]?.dimension).toBe("标题");
    expect(draft.diagnostics[0]?.evidence).toBe("");
  });

  it("空草稿结构稳定", () => {
    expect(emptyReviewDraft().nextTopics).toHaveLength(1);
  });
});