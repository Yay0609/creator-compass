/**
 * 从模型返回的文本中提取 JSON。
 *
 * 真实模型经常在 JSON 前后附加解释文字、Markdown 围栏或多余空行，
 * 这里做一次性清洗；清洗后仍无法解析则抛 JsonExtractionError。
 * 本模块为纯函数，便于单测。
 */
export class JsonExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonExtractionError";
  }
}

/** 去掉 ```json ... ``` 围栏，只保留内容。 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const firstNewline = trimmed.indexOf("\n");
  const withoutOpening = firstNewline === -1 ? trimmed.slice(3) : trimmed.slice(firstNewline + 1);
  const closing = withoutOpening.lastIndexOf("```");

  return (closing === -1 ? withoutOpening : withoutOpening.slice(0, closing)).trim();
}

/**
 * 截取第一个「括号配平」的 JSON 值：
 * 从最早的 { 或 [ 开始，按栈配平，并跳过字符串字面量中的括号。
 * 配平失败（括号不匹配／缺失）返回 null。
 */
function sliceBalancedValue(text: string): string | null {
  const braceIndex = text.indexOf("{");
  const bracketIndex = text.indexOf("[");

  let start: number;
  if (braceIndex === -1) {
    start = bracketIndex;
  } else if (bracketIndex === -1) {
    start = braceIndex;
  } else {
    start = Math.min(braceIndex, bracketIndex);
  }

  if (start === -1) {
    return null;
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === undefined) {
      break;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const opened = stack.pop();
      if (opened === undefined) {
        return null;
      }
      if (char === "}" && opened !== "{") {
        return null;
      }
      if (char === "]" && opened !== "[") {
        return null;
      }
      if (stack.length === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

/**
 * 解析模型输出。
 * - 支持 ```json 围栏与前后解释文字
 * - 模型直接返回数组时，包装成 { items: [...] }（容错，最终仍由 Zod 把关）
 * - 解析失败抛 JsonExtractionError
 */
export function extractJsonValue(text: string): unknown {
  const cleaned = stripCodeFence(text.replace(/^\uFEFF/, ""));
  const candidate = sliceBalancedValue(cleaned) ?? cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new JsonExtractionError(
      `无法解析模型返回的 JSON：${error instanceof Error ? error.message : "未知错误"}`,
    );
  }

  if (Array.isArray(parsed)) {
    return { items: parsed };
  }

  if (parsed === null || typeof parsed !== "object") {
    throw new JsonExtractionError("模型返回的 JSON 不是对象");
  }

  return parsed;
}

/** 宽容版本：解析失败返回 null，用于「降级草稿」构建。 */
export function safeExtractJsonValue(text: string): unknown {
  try {
    return extractJsonValue(text);
  } catch {
    return null;
  }
}
