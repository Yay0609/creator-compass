import { Skeleton } from "@/components/ui/skeleton";

/** 应用区通用加载骨架（P5）：路由切换时先出骨架，避免白屏。 */
export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only" role="status" aria-live="polite">
        页面加载中
      </span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
