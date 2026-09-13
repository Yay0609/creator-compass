"use client";

import { ClipboardCopy, Pencil, Star, EyeOff } from "lucide-react";
import { useState } from "react";

import { MiniBarChart } from "@/components/posts/mini-chart";
import {
  ReviewEditor,
  toEditorValue,
  toSavePayload,
  type ReviewEditorValue,
} from "@/components/reviews/review-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/client/api";
import { copyText } from "@/lib/client/clipboard";
import { formatCount, formatRate, formatShanghaiDate } from "@/lib/posts/display";
import type { ReviewDto } from "@/lib/reviews/schemas";

/** 把报告拼成可直接粘贴到备忘录的纯文本。 */
function toPlainText(review: ReviewDto): string {
  const lines: string[] = [`# 复盘报告（${formatShanghaiDate(review.createdAt)}）`, "", "## 结论摘要", review.summary || "（空）"];

  if (review.diagnostics.length > 0) {
    lines.push("", "## 分维度诊断");
    for (const item of review.diagnostics) {
      lines.push(`- 【${item.dimension || "未分类"}】${item.verdict}`);
      if (item.evidence) lines.push(`  依据：${item.evidence}`);
      if (item.suggestion) lines.push(`  建议：${item.suggestion}`);
    }
  }

  const sections: Array<[string, string[]]> = [
    ["做对的地方", review.highlights],
    ["暴露的问题", review.problems],
    ["下一步建议", review.suggestions],
  ];

  for (const [title, items] of sections) {
    if (items.length === 0) continue;
    lines.push("", `## ${title}`);
    for (const item of items) lines.push(`- ${item}`);
  }

  if (review.nextTopics.length > 0) {
    lines.push("", "## 下一批选题");
    for (const item of review.nextTopics) lines.push(`- ${item.title}：${item.reason}`);
  }

  lines.push(
    "",
    "## 基线口径",
    review.baselineNote || `对比账号历史 ${review.sampleSize} 条作品的均值与中位数`,
  );

  return lines.join("\n");
}

/** 复盘报告详情：图表 + 诊断 + 建议 + 收藏 / 忽略 / 复制 / 编辑。 */
export function ReviewReport({ review: initialReview }: { review: ReviewDto }) {
  const [review, setReview] = useState(initialReview);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<ReviewEditorValue>(() => toEditorValue(initialReview));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baselineViews = review.baseline.metrics.find((metric) => metric.key === "views") ?? null;
  const baselineInteraction =
    review.baseline.metrics.find((metric) => metric.key === "interactionRate") ?? null;

  async function patch(body: Record<string, unknown>, successText: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = await apiRequest<{ review: ReviewDto }>(`/api/reviews/${review.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setReview(result.data.review);
    setMessage(successText);
  }

  async function copy(): Promise<void> {
    const copied = await copyText(toPlainText(review));
    setMessage(copied ? "已复制到剪贴板" : "复制失败，请手动选择文本");
  }

  const viewItems = [
    ...review.posts.map((post) => ({
      label: post.title,
      value: post.views,
      variant: "primary" as const,
    })),
    ...(baselineViews?.mean === null || baselineViews === null
      ? []
      : [{ label: "账号均值（基线）", value: baselineViews.mean, variant: "muted" as const }]),
    ...(baselineViews?.median === null || baselineViews === null
      ? []
      : [{ label: "账号中位数（基线）", value: baselineViews.median, variant: "muted" as const }]),
  ];

  const interactionItems = [
    ...review.posts.map((post) => ({
      label: post.title,
      value: post.interactionRate,
      display: formatRate(post.interactionRate),
      variant: "primary" as const,
    })),
    ...(baselineInteraction === null || baselineInteraction.median === null
      ? []
      : [
          {
            label: "账号中位数（基线）",
            value: baselineInteraction.median,
            display: formatRate(baselineInteraction.median),
            variant: "muted" as const,
          },
        ]),
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>结论摘要</CardTitle>
            <Badge variant="secondary">
              {review.scope === "single" ? "单篇复盘" : `批量复盘 ${review.posts.length} 条`}
            </Badge>
            {review.isFavorite ? <Badge>已收藏</Badge> : null}
            {review.isDiscarded ? <Badge variant="outline">已忽略</Badge> : null}
            {review.source === "edited" ? <Badge variant="outline">人工编辑</Badge> : null}
          </div>
          <CardDescription>
            {formatShanghaiDate(review.createdAt)} · 基线样本 {review.sampleSize} 条
            {review.model ? ` · 模型 ${review.model}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm leading-6">{review.summary || "（暂无摘要）"}</p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={review.isFavorite ? "default" : "outline"}
              size="sm"
              disabled={busy}
              onClick={() =>
                void patch({ isFavorite: !review.isFavorite }, review.isFavorite ? "已取消收藏" : "已收藏")
              }
            >
              <Star className="h-3.5 w-3.5" />
              {review.isFavorite ? "取消收藏" : "收藏"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void patch({ isDiscarded: !review.isDiscarded }, review.isDiscarded ? "已取消忽略" : "已忽略")
              }
            >
              <EyeOff className="h-3.5 w-3.5" />
              {review.isDiscarded ? "取消忽略" : "忽略"}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void copy()}>
              <ClipboardCopy className="h-3.5 w-3.5" />
              复制报告
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setValue(toEditorValue(review));
                setEditing((previous) => !previous);
                setError(null);
                setMessage(null);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              {editing ? "取消编辑" : "编辑报告"}
            </Button>
          </div>

          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>编辑报告</CardTitle>
            <CardDescription>保存后会标记为「人工编辑」，不影响 AI 原稿的历史记录。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReviewEditor value={value} onChange={setValue} disabled={busy} />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() => {
                  void patch({ ...toSavePayload(value) }, "已保存修改");
                  setEditing(false);
                }}
              >
                {busy ? "保存中…" : "保存修改"}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setEditing(false)}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>数据对比</CardTitle>
          <CardDescription>
            只统计你有填写的数据；基线取自账号历史作品（已排除本次纳入的作品）。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <MiniBarChart
            items={viewItems}
            title="播放 / 阅读"
            formatter={(value) => formatCount(Math.round(value))}
            hint={baselineViews ? `基线样本 ${baselineViews.sampleSize} 条` : "暂无可对比的历史作品"}
          />
          <MiniBarChart
            items={interactionItems}
            title="互动率"
            hint={
              baselineInteraction
                ? `基线样本 ${baselineInteraction.sampleSize} 条`
                : "暂无可对比的历史作品"
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>分维度诊断</CardTitle>
          <CardDescription>{review.baselineNote || "（未填写基线口径说明）"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {review.diagnostics.length === 0 ? (
            <p className="text-sm text-muted-foreground">（暂无诊断）</p>
          ) : (
            review.diagnostics.map((item, index) => (
              <div key={`${item.dimension}-${index}`} className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{item.dimension || "未分类"}</Badge>
                  <span className="text-sm font-medium">{item.verdict}</span>
                </div>
                {item.evidence ? (
                  <p className="mt-2 text-xs text-muted-foreground">依据：{item.evidence}</p>
                ) : null}
                {item.suggestion ? <p className="mt-1 text-sm">建议：{item.suggestion}</p> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <BulletCard title="做对的地方" items={review.highlights} />
        <BulletCard title="暴露的问题" items={review.problems} />
        <BulletCard title="下一步建议" items={review.suggestions} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>下一批选题建议</CardTitle>
          <CardDescription>可以直接带到「选题」或「脚本」页继续加工。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {review.nextTopics.length === 0 ? (
            <p className="text-sm text-muted-foreground">（暂无选题建议）</p>
          ) : (
            review.nextTopics.map((item, index) => (
              <div key={`${item.title}-${index}`} className="rounded-md border p-3">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>基线明细</CardTitle>
          <CardDescription>
            样本 {review.sampleSize} 条
            {review.periodStart && review.periodEnd
              ? ` · ${formatShanghaiDate(review.periodStart)} 至 ${formatShanghaiDate(review.periodEnd)}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">指标</th>
                  <th className="py-1 pr-3">样本</th>
                  <th className="py-1 pr-3">均值</th>
                  <th className="py-1 pr-3">中位数</th>
                  <th className="py-1">区间</th>
                </tr>
              </thead>
              <tbody>
                {review.baseline.metrics
                  .filter((metric) => metric.sampleSize > 0)
                  .map((metric) => {
                    const show = (value: number | null): string =>
                      value === null
                        ? "—"
                        : metric.unit === "rate"
                          ? formatRate(value)
                          : formatCount(value);
                    return (
                      <tr key={metric.key} className="border-t">
                        <td className="py-1 pr-3">{metric.label}</td>
                        <td className="py-1 pr-3 tabular-nums">{metric.sampleSize}</td>
                        <td className="py-1 pr-3 tabular-nums">{show(metric.mean)}</td>
                        <td className="py-1 pr-3 tabular-nums">{show(metric.median)}</td>
                        <td className="py-1 tabular-nums">
                          {show(metric.min)} – {show(metric.max)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {review.baseline.sampleSize === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              账号还没有可对比的历史作品，本次结论只反映所选作品之间的相对差异。
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>本次纳入的作品</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {review.posts.map((post) => (
            <div key={post.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-b-0">
              <span className="truncate">{post.title}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatShanghaiDate(post.publishedAt)} · 播放 {formatCount(post.views)} · 收藏{" "}
                {formatCount(post.saves)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function BulletCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">（暂无）</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {items.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}