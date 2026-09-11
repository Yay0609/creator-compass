import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">页面不存在</h1>
      <p className="text-sm text-muted-foreground">你访问的地址可能已变更，或尚未开放。</p>
      <Link href="/" className={buttonVariants()}>
        返回首页
      </Link>
    </div>
  );
}