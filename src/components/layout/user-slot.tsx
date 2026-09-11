import { Badge } from "@/components/ui/badge";

/** P0 占位：登录能力在 P1 接入，这里先展示静态状态。 */
export function UserSlot() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
      <span className="hidden lg:inline">未登录</span>
      <Badge variant="outline">P1 接入账号</Badge>
    </div>
  );
}