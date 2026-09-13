"use client";

import { Button } from "@/components/ui/button";

/**
 * 根布局级兜底错误页（P5）：只在根 layout 抛错时渲染，因此必须自带 html 与 body。
 * 生产环境不展示 error.message，同样只给通用文案与 digest。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "20px", margin: 0 }}>应用暂时无法启动</h1>
          <p style={{ fontSize: "14px", color: "#666", margin: 0 }}>
            请刷新页面重试；如果持续出现，请稍后再访问。
          </p>
          {error.digest ? (
            <p style={{ fontSize: "12px", color: "#888", margin: 0 }}>错误编号：{error.digest}</p>
          ) : null}
          <Button onClick={reset}>刷新重试</Button>
        </div>
      </body>
    </html>
  );
}
