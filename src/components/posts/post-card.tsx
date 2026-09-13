"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { POST_COUNT_FIELDS, toCountInput, toRateInput } from "@/components/posts/post-form";
import { apiRequest } from "@/lib/client/api";
import { PLATFORMS, POST_TITLE_MAX, optionLabel } from "@/lib/constants";
import { formatCount, formatRate, formatShanghaiDate } from "@/lib/posts/display";
import type { PostDto } from "@/lib/posts/schemas";

type EditValues = Record<string, string>;

function toEditValues(post: PostDto): EditValues {
  const values: EditValues = {
    title: post.title,
    publishedAt: formatShanghaiDate(post.publishedAt),
    platform: post.platform,
    completionRate: post.completionRate === null ? "" : String(post.completionRate * 100),
    note: post.note,
  };

  for (const field of POST_COUNT_FIELDS) {
    const value = post[field.key];
    values[field.key] = value === null ? "" : String(value);
  }

  return values;
}

/** 作品卡片：展示派生指标，支持行内修正与删除（删除需二次确认）。 */
export function PostCard({
  post,
  onChanged,
  onDeleted,
}: {
  post: PostDto;
  onChanged?: (post: PostDto) => void;
  onDeleted?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [values, setValues] = useState<EditValues>(() => toEditValues(post));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);

    const payload: Record<string, unknown> = {
      title: values["title"]?.trim() ?? "",
      publishedAt: values["publishedAt"]?.trim() ?? "",
      completionRate: toRateInput(values["completionRate"] ?? ""),
      note: values["note"]?.trim() ?? "",
    };

    if ((values["platform"] ?? "").length > 0) {
      payload["platform"] = values["platform"];
    }
    for (const field of POST_COUNT_FIELDS) {
      payload[field.key] = toCountInput(values[field.key] ?? "");
    }

    const result = await apiRequest<{ post: PostDto }>(`/api/posts/${post.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setEditing(false);
    onChanged?.(result.data.post);
  }

  async function remove(): Promise<void> {
    setBusy(true);
    setError(null);

    const result = await apiRequest<{ deleted: boolean }>(`/api/posts/${post.id}`, {
      method: "DELETE",
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    onDeleted?.(post.id);
  }

  const metrics: Array<[string, string]> = [
    ["曝光", formatCount(post.impressions)],
    ["播放/阅读", formatCount(post.views)],
    ["点赞", formatCount(post.likes)],
    ["评论", formatCount(post.comments)],
    ["收藏", formatCount(post.saves)],
    ["分享", formatCount(post.shares)],
    ["涨粉", formatCount(post.followsGained)],
    ["完播率", formatRate(post.completionRate)],
    ["互动率", formatRate(post.metrics.interactionRate)],
    ["涨粉率", formatRate(post.metrics.followRate)],
  ];

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">{post.title}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatShanghaiDate(post.publishedAt)}</span>
            <span>·</span>
            <span>{optionLabel(PLATFORMS, post.platform) || "未指定平台"}</span>
            {post.scriptTitle ? (
              <>
                <span>·</span>
                <span>关联脚本：{post.scriptTitle}</span>
              </>
            ) : null}
            <Badge variant="outline">{post.source === "csv" ? "CSV 导入" : "手动录入"}</Badge>
          </div>
        </div>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setValues(toEditValues(post));
              setEditing((previous) => !previous);
              setConfirming(false);
              setError(null);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? "取消" : "编辑"}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </Button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-md bg-muted/40 px-2 py-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {post.note.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">备注：{post.note}</p>
      ) : null}

      {confirming ? (
        <div className="mt-3 space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm">
            确认删除「{post.title}」？删除后不可恢复；已生成的复盘报告凭快照不受影响。
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
              {busy ? "删除中…" : "确认删除"}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
              取消
            </Button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="mt-3 space-y-3 rounded-md border bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="标题" htmlFor={`edit-title-${post.id}`}>
              <Input
                id={`edit-title-${post.id}`}
                value={values["title"] ?? ""}
                maxLength={POST_TITLE_MAX}
                disabled={busy}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, title: event.target.value }))
                }
              />
            </Field>
            <Field label="发布时间" htmlFor={`edit-date-${post.id}`} hint="按北京时间">
              <Input
                id={`edit-date-${post.id}`}
                type="date"
                value={values["publishedAt"] ?? ""}
                disabled={busy}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, publishedAt: event.target.value }))
                }
              />
            </Field>
            <Field label="平台" htmlFor={`edit-platform-${post.id}`}>
              <Select
                id={`edit-platform-${post.id}`}
                value={values["platform"] ?? ""}
                disabled={busy}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, platform: event.target.value }))
                }
              >
                <option value="">未指定</option>
                {PLATFORMS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="完播率（%）" htmlFor={`edit-rate-${post.id}`}>
              <Input
                id={`edit-rate-${post.id}`}
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={values["completionRate"] ?? ""}
                disabled={busy}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, completionRate: event.target.value }))
                }
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {POST_COUNT_FIELDS.map((field) => (
              <Field key={field.key} label={field.label} htmlFor={`edit-${field.key}-${post.id}`}>
                <Input
                  id={`edit-${field.key}-${post.id}`}
                  type="number"
                  min={0}
                  value={values[field.key] ?? ""}
                  disabled={busy}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, [field.key]: event.target.value }))
                  }
                />
              </Field>
            ))}
          </div>

          <Field label="备注" htmlFor={`edit-note-${post.id}`}>
            <Textarea
              id={`edit-note-${post.id}`}
              value={values["note"] ?? ""}
              maxLength={200}
              disabled={busy}
              className="min-h-[60px]"
              onChange={(event) =>
                setValues((previous) => ({ ...previous, note: event.target.value }))
              }
            />
          </Field>

          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "保存中…" : "保存修改"}
          </Button>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}