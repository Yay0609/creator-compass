"use client";

import { Bookmark, BookmarkCheck, Pencil, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CopyButton } from "@/components/scripts/copy-button";
import {
  ScriptEditor,
  toEditorValue,
  toSavePayload,
  validateEditorValue,
  type ScriptEditorValue,
} from "@/components/scripts/script-editor";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/client/api";
import { downloadTextFile, safeFileName } from "@/lib/client/download";
import type { ScriptDto } from "@/lib/scripts/schemas";
import { scriptToMarkdown } from "@/lib/scripts/markdown";

function formatSeconds(total: number): string {
  if (total <= 0) {
    return "—";
  }
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

/** 脚本详情：查看 / 编辑 / 复制 / 收藏。编辑保存后 source 变为 edited。 */
export function ScriptDetail({ script: initialScript }: { script: ScriptDto }) {
  const [script, setScript] = useState(initialScript);
  const [value, setValue] = useState<ScriptEditorValue>(() => toEditorValue(initialScript));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function exportMarkdown(): void {
    try {
      downloadTextFile(safeFileName(script.title) + ".md", scriptToMarkdown(script));
      setMessage("已导出 Markdown 分镜表，可直接粘贴到编辑器。");
      setError(null);
    } catch {
      setError("导出失败，请改用「复制口播稿」后手动保存。");
    }
  }

  function startEdit(): void {
    setValue(toEditorValue(script));
    setEditing(true);
    setMessage(null);
    setError(null);
  }

  function cancelEdit(): void {
    setValue(toEditorValue(script));
    setEditing(false);
    setError(null);
  }

  async function save(): Promise<void> {
    const invalid = validateEditorValue(value);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const result = await apiRequest<{ script: ScriptDto }>(`/api/scripts/${script.id}`, {
      method: "PATCH",
      body: JSON.stringify(toSavePayload(value)),
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setScript(result.data.script);
    setValue(toEditorValue(result.data.script));
    setEditing(false);
    setMessage("已保存，刷新后仍然保留。");
  }

  async function toggleFavorite(): Promise<void> {
    if (favoritePending) {
      return;
    }

    setFavoritePending(true);
    setError(null);

    const result = await apiRequest<{ script: ScriptDto }>(`/api/scripts/${script.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isFavorite: !script.isFavorite }),
    });

    setFavoritePending(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setScript(result.data.script);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{formatSeconds(script.totalSeconds)}</Badge>
                <Badge variant="outline">{script.source === "edited" ? "人工编辑" : "AI 生成"}</Badge>
                {script.isDiscarded ? <Badge variant="outline">已忽略</Badge> : null}
                {script.model ? <Badge variant="secondary">{script.model}</Badge> : null}
              </div>
              <CardTitle className="text-lg leading-snug">{script.title}</CardTitle>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={script.isFavorite ? "default" : "outline"}
                size="icon"
                disabled={favoritePending}
                onClick={() => void toggleFavorite()}
                aria-label={script.isFavorite ? "取消收藏" : "收藏"}
                title={script.isFavorite ? "取消收藏" : "收藏"}
              >
                {script.isFavorite ? (
                  <BookmarkCheck className="h-4 w-4" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </Button>

              {editing ? (
                <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                  <Undo2 className="h-4 w-4" />
                  放弃修改
                </Button>
              ) : (
                <Button variant="outline" onClick={startEdit}>
                  <Pencil className="h-4 w-4" />
                  编辑
                </Button>
              )}

              {editing ? (
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? "保存中…" : "保存"}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={script.title} label="复制主标题" />
            <CopyButton value={script.fullScript} label="复制口播稿" />
            <CopyButton value={script.tags.join(" ")} label="复制标签" />
            <Button variant="outline" size="sm" onClick={exportMarkdown}>
              {"导出分镜表"}
            </Button>
            <CopyButton value={script.coverCopy} label="复制封面文案" />
            {script.topicId ? (
              <Link
                href={`/scripts/new?topicId=${script.topicId}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                重新生成（新记录）
              </Link>
            ) : null}
          </div>

          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">编辑脚本</CardTitle>
          </CardHeader>
          <CardContent>
            <ScriptEditor value={value} onChange={setValue} disabled={saving} />
          </CardContent>
        </Card>
      ) : (
        <>
          {script.titles.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">标题候选</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-inside list-decimal space-y-1 text-sm">
                  {script.titles.map((title, index) => (
                    <li key={`${title}-${index}`} className="leading-relaxed">
                      {title}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}

          {script.hook.trim().length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">开头钩子</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{script.hook}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">分段脚本</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {script.outline.length === 0 ? (
                <p className="text-sm text-muted-foreground">还没有分段内容，点「编辑」补上。</p>
              ) : (
                script.outline.map((item, index) => (
                  <div key={`${item.section}-${index}`} className="space-y-1.5 border-l-2 pl-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {item.section.length > 0 ? item.section : `第 ${index + 1} 段`}
                      </span>
                      {item.seconds > 0 ? (
                        <Badge variant="outline">{item.seconds} 秒</Badge>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.content}</p>
                    {item.visual.trim().length > 0 ? (
                      <p className="text-xs text-muted-foreground">画面：{item.visual}</p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">标签</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {script.tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  script.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">封面与结尾</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">封面文案</p>
                  <p>{script.coverCopy.length > 0 ? script.coverCopy : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">结尾引导</p>
                  <p>{script.cta.length > 0 ? script.cta : "—"}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}