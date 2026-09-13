"use client";

import { useState } from "react";

import { ReviewCard } from "@/components/reviews/review-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { describeError } from "@/lib/client/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/client/api";
import type { ReviewDto } from "@/lib/reviews/schemas";

type ListPayload = { reviews: ReviewDto[]; nextCursor: string | null };

/** 复盘历史列表：游标分页 + 收藏联动（复盘不做硬删除）。 */
export function ReviewHistory({
  initialReviews,
  initialCursor,
  emptyText = "还没有复盘报告。勾选作品生成一份后，这里会按时间倒序保留全部记录。",
}: {
  initialReviews: ReviewDto[];
  initialCursor: string | null;
  emptyText?: string;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore(): Promise<void> {
    if (!cursor || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    const result = await apiRequest<ListPayload>(
      `/api/reviews?${new URLSearchParams({ cursor }).toString()}`,
    );

    setLoading(false);

    if (!result.ok) {
      setError(describeError(result.error));
      return;
    }

    setReviews((previous) => [...previous, ...result.data.reviews]);
    setCursor(result.data.nextCursor);
  }

  function handleChanged(updated: ReviewDto): void {
    setReviews((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
  }

  if (reviews.length === 0) {
    return (
      <EmptyState title={emptyText} />
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} onChanged={handleChanged} />
      ))}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {cursor ? (
        <Button variant="outline" className="w-full" onClick={() => void loadMore()} disabled={loading}>
          {loading ? "加载中…" : "加载更多"}
        </Button>
      ) : (
        <p className="text-center text-xs text-muted-foreground">已经到底了</p>
      )}

      {loading ? <Skeleton className="h-24 w-full" /> : null}
    </div>
  );
}