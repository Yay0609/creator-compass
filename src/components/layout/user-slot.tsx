import { LogoutButton } from "@/components/auth/logout-button";
import type { ShellUser } from "@/components/layout/shell-user";

export function UserSlot({ user }: { user: ShellUser }) {
  const display = user.nickname ?? user.email;

  return (
    <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
          {display.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-sm text-muted-foreground">{display}</span>
      </div>
      <LogoutButton />
    </div>
  );
}