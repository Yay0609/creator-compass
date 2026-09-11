import type { ReactNode } from "react";

import { requireProfile } from "@/lib/auth/session";

/**
 * 需要「已完成账号画像」才能访问的分区：选题 / 脚本 / 数据 / 复盘。
 * 把守卫放在路由组布局里，新增子路由时无需重复校验。
 */
export default async function NeedsProfileLayout({ children }: { children: ReactNode }) {
  await requireProfile();
  return <>{children}</>;
}