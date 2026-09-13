"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/client/api";
import type { TopicDto } from "@/lib/topics/schemas";
import { cn } from "@/lib/utils";

const DIFFICULTY_LABEL: Record<string, string> = {
  low: "易上手",
  medium: "中等",
  high: "有挑战",
};

function Row({ label, value }: { label: string; value: string }) {
  if (value.trim().length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

export function TopicCard({
  topic,
  index,
  onChanged,
  showDetailLink = true,
}: {
  topic: TopicDto;
  index?: number;
  onChanged?: (topic: TopicDto) => void;
  /** 详情页自身不需要再链回自己 */
  showDetailLink?: boolean;
}) {
  const [current, setCurrent] = useState(topic);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleFavorite() {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    const result = await apiRequest<{ topic: TopicDto }>(`/api/topics/${current.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isFavorite: !current.isFavorite }),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setCurrent(result.data.topic);
    onChanged?.(result.data.topic);
  }

  return (
    <Card className={cn(current.isDiscarded && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {typeof index === "number" ? <Badge variant="secondary">#{index + 1}</Badge> : null}
              <Badge variant="outline">{current.score} 分</Badge>
              {current.difficulty.length > 0 ? (
                <Badge variant="outline">
                  {DIFFICULTY_LABEL[current.difficulty] ?? current.difficulty}
                </Badge>
              ) : null}
              {current.source === "edited" ? <Badge variant="secondary">手动保存</Badge> : null}
              {current.isDiscarded ? <Badge variant="outline">已忽略</Badge> : null}
            </div>
            <CardTitle className="text-base leading-snug">{current.title}</CardTitle>
          </div>

          <Button
            variant={current.isFavorite ? "default" : "outline"}
            size="icon"
            disabled={pending}
            onClick={toggleFavorite}
            aria-label={current.isFavorite ? "取消收藏" : "收藏"}
            title={current.isFavorite ? "取消收藏" : "收藏"}
          >
            {current.isFavorite ? (
              <BookmarkCheck className="h-4 w-4" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <Row label="切入角度" value={current.angle} />
        <Row label="推荐理由" value={current.reason} />
        <Row label="参考方向" value={current.referenceDirection} />

        {current.keywords.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {current.keywords.map((keyword) => (
              <Badge key={keyword} variant="secondary">
                {keyword}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" size="sm" disabled title="脚本生成将在 P3 开放">
            去生成脚本（P3 开放）
          </Button>
          {showDetailLink ? (
            <Link
              href={`/topics/${current.id}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              查看详情
            </Link>
          ) : null}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
