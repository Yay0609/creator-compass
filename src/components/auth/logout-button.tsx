"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/client/api";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await apiRequest("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="退出登录"
      title="退出登录"
      disabled={pending}
      onClick={handleLogout}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}