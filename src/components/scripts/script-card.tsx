"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CopyButton } from "@/components/scripts/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/client/api";
import type { ScriptDto } from "@/lib/scripts/schemas";
import { cn } from "@/lib/utils";

function formatSeconds(total: number): string {
  if (total <= 0) {
    return "—";
  }
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

/** 脚本卡片：列表与历史共用（收藏联动，不做硬删除）。 */
export function ScriptCard({
  script,
  index,
  onChanged,
  showDetailLink = true,
}: {
  script: ScriptDto;
  index?: number;
  onChanged?: (script: ScriptDto) => void;
  showDetailLink?: boolean;
}) {
  const [current, setCurrent] = useState(script);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleFavorite(): Promise<void> {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    const result = await apiRequest<{ script: ScriptDto }>(`/api/scripts/${current.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isFavorite: !current.isFavorite }),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setCurrent(result.data.script);
    onChanged?.(result.data.script);
  }

  return (
    <Card className={cn(current.isDiscarded && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {typeof index === "number" ? <Badge variant="secondary">#{index + 1}</Badge> : null}
              <Badge variant="outline">{formatSeconds(current.totalSeconds)}</Badge>
              {current.titles.length > 1 ? (
                <Badge variant="secondary">{current.titles.length} 个标题</Badge>
              ) : null}
              {current.source === "edited" ? <Badge variant="secondary">已编辑</Badge> : null}
              {current.isDiscarded ? <Badge variant="outline">已忽略</Badge> : null}
            </div>
            <CardTitle className="text-base leading-snug">{current.title}</CardTitle>
          </div>

          <Button
            variant={current.isFavorite ? "default" : "outline"}
            size="icon"
            disabled={pending}
            onClick={() => void toggleFavorite()}
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
        {current.hook.trim().length > 0 ? (
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">开头钩子</p>
            <p className="whitespace-pre-wrap leading-relaxed">{current.hook}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {current.outline.map((item, itemIndex) => (
            <Badge key={`${item.section}-${itemIndex}`} variant="outline">
              {item.section.length > 0 ? item.section : `第 ${itemIndex + 1} 段`}
              {item.seconds > 0 ? ` · ${item.seconds}s` : ""}
            </Badge>
          ))}
        </div>

        {current.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {current.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <CopyButton value={current.fullScript} label="复制口播稿" />
          {showDetailLink ? (
            <Link
              href={`/scripts/${current.id}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              查看与编辑
            </Link>
          ) : null}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}