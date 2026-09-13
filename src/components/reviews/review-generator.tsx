"use client";

import { Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  ReviewEditor,
  toEditorValue,
  toSavePayload,
  type ReviewEditorValue,
} from "@/components/reviews/review-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/client/api";
import { streamSse, SseRequestError } from "@/lib/client/sse";
import { REVIEW_POST_MAX } from "@/lib/constants";
import { formatShanghaiDate } from "@/lib/posts/display";
import type { PostDto } from "@/lib/posts/schemas";
import type { ReviewDto, ReviewUsage, SseReviewError } from "@/lib/reviews/schemas";

const PHASE_LABEL: Record<string, string> = {
  calling: "正在请求模型…",
  parsing: "正在解析模型输出…",
  validating: "正在校验格式…",
  repairing: "格式不符，正在自动修复（第 2 次尝试）…",
};

type Status = "idle" | "running" | "done" | "draft" | "error";

/** 复盘生成入口：选作品 -> SSE 生成 -> 成功跳详情；二次校验失败降级为可编辑草稿。 */
export function ReviewGenerator({
  posts,
  initialUsage,
  description = "勾选要复盘的作品（1–50 条），AI 会结合账号历史基线给出诊断与下一步建议。",
}: {
  posts: PostDto[];
  initialUsage: ReviewUsage;
  description?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [focus, setFocus] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<{ phase: string; chars: number } | null>(null);
  const [usage, setUsage] = useState<ReviewUsage>(initialUsage);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewEditorValue | null>(null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reviewExhausted = usage.review.used >= usage.review.limit;
  const dailyExhausted = usage.aiDaily.used >= usage.aiDaily.limit;
  const running = status === "running";

  function toggle(id: string): void {
    setSelected((previous) => {
      if (previous.includes(id)) {
        return previous.filter((item) => item !== id);
      }
      if (previous.length >= REVIEW_POST_MAX) {
        return previous;
      }
      return [...previous, id];
    });
  }

  async function generate(): Promise<void> {
    if (selected.length === 0) {
      setStatus("error");
      setErrorCode("VALIDATION_FAILED");
      setErrorMessage("请先勾选至少 1 条作品");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("running");
    setDraft(null);
    setErrorCode(null);
    setErrorMessage(null);
    setNotice(null);
    setProgress({ phase: "calling", chars: 0 });

    const payload: Record<string, unknown> = { postIds: selected };
    if (focus.trim().length > 0) {
      payload["focus"] = focus.trim();
    }

    try {
      await streamSse("/api/reviews/generate", payload, {
        onReviewMeta: (data) => setUsage(data.usage),
        onProgress: (data) => setProgress({ phase: data.phase, chars: data.chars }),
        onReviewDone: (data) => {
          setUsage(data.usage);
          setStatus("done");
          setNotice("报告已生成，正在打开…");
          router.push(`/reviews/${data.reviewId}`);
        },
        onError: (data: SseReviewError) => {
          setProgress(null);
          setErrorCode(data.code);
          setErrorMessage(data.message);

          if (data.code === "AI_INVALID_OUTPUT") {
            const details = data.details;
            const rawDraft =
              details !== null && typeof details === "object" && "draft" in details
                ? (details as { draft?: unknown }).draft
                : undefined;
            setDraft(
              toEditorValue(
                (rawDraft ?? {}) as Parameters<typeof toEditorValue>[0],
              ),
            );
            setStatus("draft");
            return;
          }

          if (data.code === "QUOTA_EXCEEDED" || data.code === "RATE_LIMITED") {
            setNotice("额度信息可在「设置」页查看。");
          }

          setStatus("error");
        },
      });
    } catch (error) {
      setProgress(null);
      setStatus("error");

      if (error instanceof SseRequestError) {
        setErrorCode(error.code);
        setErrorMessage(error.message);
        if (error.code === "QUOTA_EXCEEDED" || error.code === "RATE_LIMITED") {
          setNotice("额度信息可在「设置」页查看。");
        }
        return;
      }

      setErrorCode("NETWORK");
      setErrorMessage("网络异常，请稍后重试");
    }
  }

  async function saveDraft(): Promise<void> {
    if (!draft) {
      return;
    }

    setSaving(true);
    const payload = toSavePayload(draft);

    const result = await apiRequest<{ review: ReviewDto }>("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ ...payload, postIds: selected }),
    });

    setSaving(false);

    if (!result.ok) {
      setErrorMessage(result.error.message);
      return;
    }

    router.push(`/reviews/${result.data.review.id}`);
  }

  function cancel(): void {
    abortRef.current?.abort();
    setStatus("idle");
    setProgress(null);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>生成复盘报告</CardTitle>
          <Badge variant="secondary">
            本月 {usage.review.used}/{usage.review.limit}
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {posts.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            还没有作品数据。先在上方录入或导入作品，再来生成复盘。
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">选择作品（已选 {selected.length} 条）</p>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={running}
                  onClick={() =>
                    setSelected(posts.slice(0, REVIEW_POST_MAX).map((post) => post.id))
                  }
                >
                  全选
                </Button>
                <Button variant="ghost" size="sm" disabled={running} onClick={() => setSelected([])}>
                  清空
                </Button>
              </div>
            </div>

            <div className="max-h-64 space-y-1 overflow-auto rounded-md border p-2">
              {posts.map((post) => (
                <label
                  key={post.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selected.includes(post.id)}
                    disabled={running}
                    onChange={() => toggle(post.id)}
                  />
                  <span className="flex-1 truncate" title={post.title}>
                    {post.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatShanghaiDate(post.publishedAt)}
                  </span>
                </label>
              ))}
            </div>

            <Field label="补充说明（可选）" htmlFor="review-focus" hint="最多 200 字">
              <Textarea
                id="review-focus"
                value={focus}
                maxLength={200}
                disabled={running}
                className="min-h-[60px]"
                placeholder="例如：这次主要想搞清为什么收藏高但涨粉低"
                onChange={(event) => setFocus(event.target.value)}
              />
            </Field>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void generate()}
            disabled={running || posts.length === 0 || reviewExhausted || dailyExhausted}
          >
            <Sparkles className="h-4 w-4" />
            生成复盘
          </Button>
          {running ? (
            <Button variant="ghost" onClick={cancel}>
              <X className="h-4 w-4" />
              取消
            </Button>
          ) : null}
        </div>

        {reviewExhausted ? (
          <p className="text-sm text-destructive">本月复盘额度已用完，下月自动恢复。</p>
        ) : null}
        {dailyExhausted ? (
          <p className="text-sm text-destructive">今日 AI 调用已达上限，请明天再来。</p>
        ) : null}

        {running && progress ? (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p>{PHASE_LABEL[progress.phase] ?? "处理中…"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              已接收 {progress.chars} 字；只展示进度，不展示模型原文。
            </p>
          </div>
        ) : null}

        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        {errorMessage && status !== "draft" ? (
          <p className="text-sm text-destructive">
            {errorCode ? `[${errorCode}] ` : ""}
            {errorMessage}
          </p>
        ) : null}

        {status === "draft" && draft ? (
          <div className="space-y-4 rounded-md border border-destructive/40 bg-destructive/5 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">模型输出格式异常，已降级为可编辑草稿</p>
              <p className="text-xs text-muted-foreground">
                本次生成不计入配额。补全后保存，即可当作一份人工报告继续使用。
              </p>
            </div>

            <ReviewEditor value={draft} onChange={setDraft} disabled={saving} />

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveDraft()} disabled={saving}>
                {saving ? "保存中…" : "保存草稿为报告"}
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setDraft(null);
                  setStatus("idle");
                }}
              >
                放弃草稿
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}