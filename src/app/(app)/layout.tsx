import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

// P1 将在此处加入登录态校验（未登录跳转 /login）
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}