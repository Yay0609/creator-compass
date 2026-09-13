import { describe, expect, it } from "vitest";

import { JsonExtractionError, extractJsonValue, safeExtractJsonValue } from "@/lib/ai/json";

describe("AI 输出 JSON 提取", () => {
  it("直接解析纯 JSON", () => {
    expect(extractJsonValue('{"items":[]}')).toEqual({ items: [] });
  });

  it("剥掉 ```json 围栏", () => {
    expect(extractJsonValue('```json\n{"items":[1]}\n```')).toEqual({ items: [1] });
  });

  it("忽略 JSON 前后的解释文字", () => {
    expect(extractJsonValue('好的，这是结果：\n{"items":[2]}\n希望有帮助')).toEqual({ items: [2] });
  });

  it("字符串内的花括号不会截断解析", () => {
    expect(extractJsonValue('{"title":"用 {花括号} 测试"}')).toEqual({ title: "用 {花括号} 测试" });
  });

  it("模型直接返回数组时包装成 items", () => {
    expect(extractJsonValue('[{"title":"a"}]')).toEqual({ items: [{ title: "a" }] });
  });

  it("无法解析时抛 JsonExtractionError", () => {
    expect(() => extractJsonValue("抱歉，我无法输出 JSON")).toThrow(JsonExtractionError);
  });

  it("safeExtractJsonValue 解析失败返回 null", () => {
    expect(safeExtractJsonValue("not json")).toBeNull();
    expect(safeExtractJsonValue('{"items":[1]}')).toEqual({ items: [1] });
  });
});
