"use client";

import { useState } from "react";

import { TopicCard } from "@/components/topics/topic-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/client/api";
import type { TopicDto } from "@/lib/topics/schemas";

type ListPayload = { topics: TopicDto[]; nextCursor: string | null };

/** 历史选题列表：游标分页 + 收藏联动（P2 不做硬删除）。 */
export function TopicHistory({
  initialTopics,
  initialCursor,
}: {
  initialTopics: TopicDto[];
  initialCursor: string | null;
}) {
  const [topics, setTopics] = useState(initialTopics);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    const result = await apiRequest<ListPayload>(
      `/api/topics?cursor=${encodeURIComponent(cursor)}`,
    );

    setLoading(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setTopics((previous) => [...previous, ...result.data.topics]);
    setCursor(result.data.nextCursor);
  }

  function handleChanged(updated: TopicDto) {
    setTopics((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
  }

  if (topics.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        还没有历史选题。生成一批后，这里会按时间倒序保留全部记录。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {topics.map((topic) => (
        <TopicCard key={topic.id} topic={topic} onChanged={handleChanged} />
      ))}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {cursor ? (
        <Button variant="outline" className="w-full" onClick={loadMore} disabled={loading}>
          {loading ? "加载中…" : "加载更多"}
        </Button>
      ) : (
        <p className="text-center text-xs text-muted-foreground">已经到底了</p>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
    </div>
  );
}
