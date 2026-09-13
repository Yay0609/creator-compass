"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/client/api";
import { formatShanghaiDate } from "@/lib/posts/display";
import type { ReviewDto } from "@/lib/reviews/schemas";

/** 复盘列表项：摘要 + 关键信息 + 收藏快速切换。 */
export function ReviewCard({
  review,
  onChanged,
}: {
  review: ReviewDto;
  onChanged?: (review: ReviewDto) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggleFavorite(): Promise<void> {
    setBusy(true);
    const result = await apiRequest<{ review: ReviewDto }>(`/api/reviews/${review.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isFavorite: !review.isFavorite }),
    });
    setBusy(false);

    if (result.ok) {
      onChanged?.(result.data.review);
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/reviews/${review.id}`} className="text-sm font-medium hover:underline">
              {review.scope === "single" ? "单篇复盘" : `批量复盘（${review.posts.length} 条）`}
            </Link>
            <Badge variant="outline">{formatShanghaiDate(review.createdAt)}</Badge>
            {review.isFavorite ? <Badge>已收藏</Badge> : null}
            {review.isDiscarded ? <Badge variant="outline">已忽略</Badge> : null}
            {review.source === "edited" ? <Badge variant="secondary">人工编辑</Badge> : null}
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {review.summary || "（暂无摘要）"}
          </p>
          <p className="text-xs text-muted-foreground">
            基线样本 {review.sampleSize} 条 · 诊断 {review.diagnostics.length} 条 · 建议{" "}
            {review.suggestions.length} 条
          </p>
        </div>

        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void toggleFavorite()}>
            {review.isFavorite ? "取消收藏" : "收藏"}
          </Button>
          <Link
            href={`/reviews/${review.id}`}
            className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm hover:bg-accent"
          >
            查看
          </Link>
        </div>
      </div>
    </div>
  );
}