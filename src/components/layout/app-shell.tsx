import Link from "next/link";
import type { ReactNode } from "react";

import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { SkipLink } from "@/components/layout/skip-link";
import type { ShellUser } from "@/components/layout/shell-user";
import { UserSlot } from "@/components/layout/user-slot";
import { APP_NAME } from "@/lib/constants";

export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <SkipLink />

      <aside className="hidden w-64 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/dashboard" className="text-base font-semibold">
            {APP_NAME}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="border-t">
          <UserSlot user={user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <Link href="/dashboard" className="text-base font-semibold">
            {APP_NAME}
          </Link>
          <div className="ml-auto min-w-0">
            <UserSlot user={user} />
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">
          {children}
        </main>

        <MobileTabBar />
      </div>
    </div>
  );
}
