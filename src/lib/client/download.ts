"use client";

/**
 * 浏览器本地下载文本文件（纯客户端）：内容不经过任何服务端接口。
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string = "text/markdown;charset=utf-8",
): void {
  if (typeof document === "undefined") {
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * 文件名安全化：去掉各系统不允许的字符（含 Windows 的冒号、引号与星号），
 * 折叠空白并限制长度。用逐字符判断而不是正则，避免引号带来的转义问题。
 */
export function safeFileName(name: string, fallback: string = "export"): string {
  const illegal = "\\\\/:*?<>|";

  const cleaned = Array.from(name)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code < 32 || code === 34 || illegal.includes(char)) {
        return "-";
      }
      return char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+/, "");

  const trimmed = cleaned.slice(0, 60);

  return trimmed.length > 0 ? trimmed : fallback;
}
