import Link from "next/link";

import { APP_NAME } from "@/lib/constants";

/** 公开区页脚（P5）：合规入口与免责说明。 */
export function PublicFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <p>{APP_NAME} · AI 选题 / 脚本 / 复盘助手</p>
        <nav className="flex flex-wrap gap-4 sm:ml-auto" aria-label="合规与服务条款">
          <Link href="/privacy" className="hover:text-foreground">
            隐私政策
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            服务条款
          </Link>
          <Link href="/login" className="hover:text-foreground">
            登录
          </Link>
        </nav>
      </div>
      <p className="mx-auto max-w-5xl px-6 pb-8 text-xs text-muted-foreground">
        AI 生成内容仅供参考，作品的流量表现受选题、发布时机与平台规则等多因素影响，不构成效果承诺。
      </p>
    </footer>
  );
}
