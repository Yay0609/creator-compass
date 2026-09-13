import type { ScriptDto } from "@/lib/scripts/schemas";

/**
 * 脚本 -> Markdown 分镜表（纯函数，客户端可用）。
 *
 * 导出完全在浏览器本地完成：不上传内容、不新增服务端接口。
 * 所有会破坏 Markdown 结构的字符（表格竖线、换行）都先转义。
 */

/** 表格单元格转义：竖线会破坏表格结构，换行会打断整行。 */
export function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/** 行内文本归一化：折叠换行，避免破坏标题与列表结构。 */
export function toInlineText(value: string): string {
  return value.replace(/\s*\r?\n\s*/g, " ").trim();
}

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value - minutes * 60);

  return minutes > 0 ? minutes + " 分 " + seconds + " 秒" : seconds + " 秒";
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const pad = (value: number): string => (value < 10 ? "0" + value : String(value));

  return (
    date.getFullYear() +
    "-" + pad(date.getMonth() + 1) +
    "-" + pad(date.getDate()) +
    " " + pad(date.getHours()) +
    ":" + pad(date.getMinutes())
  );
}

const TABLE_HEADER = "| 镜号 | 段落 | 时长 | 口播内容 | 画面 / 字幕 |";
const TABLE_DIVIDER = "| --- | --- | --- | --- | --- |";

/** 生成完整的 Markdown 分镜表。 */
export function scriptToMarkdown(
  script: ScriptDto,
  options?: { includeFullScript?: boolean },
): string {
  const lines: string[] = [];
  const title = toInlineText(script.title) || "未命名脚本";

  lines.push("# " + title);
  lines.push("");
  lines.push(
    "> 由「创作罗盘」导出 · " +
      formatDateTime(script.createdAt) +
      " · 平台 " +
      (script.platform || "—") +
      " · 总时长 " +
      formatSeconds(script.totalSeconds),
  );
  lines.push("");

  if (script.titles.length > 0) {
    lines.push("## 标题候选");
    lines.push("");
    script.titles.forEach((item, index) => {
      lines.push(String(index + 1) + ". " + toInlineText(item));
    });
    lines.push("");
  }

  if (script.hook.trim().length > 0) {
    lines.push("## 开头钩子");
    lines.push("");
    lines.push(toInlineText(script.hook));
    lines.push("");
  }

  lines.push("## 分镜脚本");
  lines.push("");
  lines.push(TABLE_HEADER);
  lines.push(TABLE_DIVIDER);

  if (script.outline.length === 0) {
    lines.push("| — | — | — | 暂无分段 | — |");
  } else {
    script.outline.forEach((item, index) => {
      lines.push(
        "| " +
          String(index + 1) +
          " | " +
          escapeTableCell(item.section) +
          " | " +
          formatSeconds(item.seconds) +
          " | " +
          escapeTableCell(item.content) +
          " | " +
          escapeTableCell(item.visual || "—") +
          " |",
      );
    });
  }
  lines.push("");

  if (script.tags.length > 0) {
    lines.push("## 标签");
    lines.push("");
    lines.push(script.tags.map((tag) => "#" + toInlineText(tag)).join(" "));
    lines.push("");
  }

  if (script.coverCopy.trim().length > 0) {
    lines.push("## 封面文案");
    lines.push("");
    lines.push(toInlineText(script.coverCopy));
    lines.push("");
  }

  if (script.cta.trim().length > 0) {
    lines.push("## 结尾引导");
    lines.push("");
    lines.push(toInlineText(script.cta));
    lines.push("");
  }

  if (options?.includeFullScript !== false && script.fullScript.trim().length > 0) {
    lines.push("## 完整口播稿");
    lines.push("");
    lines.push(script.fullScript.trim());
    lines.push("");
  }

  return lines.join("\n");
}
