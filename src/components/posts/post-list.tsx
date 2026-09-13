"use client";

import { PostCard } from "@/components/posts/post-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { PostDto } from "@/lib/posts/schemas";

/** 作品列表（纯展示 + 加载更多由外部状态驱动）。 */
export function PostList({
  posts,
  hasMore,
  loading,
  onLoadMore,
  onChanged,
  onDeleted,
  emptyText = "还没有作品数据。用上方表单单条录入，或粘贴 CSV 批量导入。",
}: {
  posts: PostDto[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  onChanged: (post: PostDto) => void;
  onDeleted: (id: string) => void;
  emptyText?: string;
}) {
  if (posts.length === 0) {
    return (
      <EmptyState title={emptyText} />
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onChanged={onChanged} onDeleted={onDeleted} />
      ))}

      {hasMore ? (
        <Button variant="outline" className="w-full" disabled={loading} onClick={onLoadMore}>
          {loading ? "加载中…" : "加载更多"}
        </Button>
      ) : (
        <p className="text-center text-xs text-muted-foreground">已经到底了</p>
      )}

      {loading ? <Skeleton className="h-24 w-full" /> : null}
    </div>
  );
}