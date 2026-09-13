"use client";

import { useState } from "react";

import { ScriptCard } from "@/components/scripts/script-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { describeError } from "@/lib/client/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/client/api";
import type { ScriptDto } from "@/lib/scripts/schemas";

type ListPayload = { scripts: ScriptDto[]; nextCursor: string | null };

/** 脚本历史列表：游标分页 + 收藏联动（P3 不做硬删除）。 */
export function ScriptHistory({
  initialScripts,
  initialCursor,
  topicId,
  emptyText = "还没有脚本。生成一个后，这里会按时间倒序保留全部记录。",
}: {
  initialScripts: ScriptDto[];
  initialCursor: string | null;
  /** 只看某个选题下的脚本 */
  topicId?: string;
  emptyText?: string;
}) {
  const [scripts, setScripts] = useState(initialScripts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore(): Promise<void> {
    if (!cursor || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ cursor });
    if (topicId) {
      params.set("topicId", topicId);
    }

    const result = await apiRequest<ListPayload>(`/api/scripts?${params.toString()}`);

    setLoading(false);

    if (!result.ok) {
      setError(describeError(result.error));
      return;
    }

    setScripts((previous) => [...previous, ...result.data.scripts]);
    setCursor(result.data.nextCursor);
  }

  function handleChanged(updated: ScriptDto): void {
    setScripts((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
  }

  if (scripts.length === 0) {
    return (
      <EmptyState title={emptyText} />
    );
  }

  return (
    <div className="space-y-3">
      {scripts.map((script) => (
        <ScriptCard key={script.id} script={script} onChanged={handleChanged} />
      ))}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {cursor ? (
        <Button variant="outline" className="w-full" onClick={() => void loadMore()} disabled={loading}>
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