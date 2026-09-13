"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MOBILE_TAB_ITEMS, isNavItemActive } from "@/components/nav-config";
import { cn } from "@/lib/utils";

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]"
      aria-label="底部导航"
    >
      <ul className="grid grid-cols-5">
        {MOBILE_TAB_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}