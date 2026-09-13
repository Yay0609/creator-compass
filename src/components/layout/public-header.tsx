import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

/** 公开区顶栏（P5）：落地页、隐私政策、服务条款共用。 */
export function PublicHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-6">
        <Link href="/" className="text-base font-semibold">
          {APP_NAME}
        </Link>

        <nav className="ml-auto flex items-center gap-3" aria-label="公开区导航">
          <Link href="/privacy" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
            隐私政策
          </Link>
          <Link href="/terms" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
            服务条款
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            登录
          </Link>
          <Link href="/register" className={buttonVariants({ size: "sm" })}>
            免费注册
          </Link>
        </nav>
      </div>
    </header>
  );
}
