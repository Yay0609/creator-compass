import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

import "./globals.css";

// 注意：刻意不使用 next/font/google，避免构建期依赖外网下载字体
export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — AI 选题 / 脚本 / 复盘`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}