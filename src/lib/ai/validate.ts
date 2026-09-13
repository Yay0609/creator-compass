import type { z } from "zod";

/** 把 Zod 错误压成「字段: 原因」的可读列表，用于修复提示词与日志。 */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".") || "(root)";
    return `${path}: ${issue.message}`;
  });
}