import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/session";

// 已登录用户不应再看到登录 / 注册页
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}