"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/client/api";
import { PLATFORMS, POST_COUNT_MAX, POST_TITLE_MAX } from "@/lib/constants";
import type { PostDto } from "@/lib/posts/schemas";

export const POST_COUNT_FIELDS = [
  { key: "impressions", label: "曝光 / 展现" },
  { key: "views", label: "播放 / 阅读" },
  { key: "likes", label: "点赞" },
  { key: "comments", label: "评论" },
  { key: "saves", label: "收藏" },
  { key: "shares", label: "分享" },
  { key: "followsGained", label: "涨粉" },
] as const;

export type PostCountKey = (typeof POST_COUNT_FIELDS)[number]["key"];

type FormValues = Record<PostCountKey, string> & {
  title: string;
  publishedAt: string;
  platform: string;
  completionRate: string;
  note: string;
};

const EMPTY: FormValues = {
  title: "",
  publishedAt: "",
  platform: "",
  impressions: "",
  views: "",
  likes: "",
  comments: "",
  saves: "",
  shares: "",
  followsGained: "",
  completionRate: "",
  note: "",
};

export function toCountInput(raw: string): number | null {
  const text = raw.trim();
  if (text.length === 0) {
    return null;
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.min(POST_COUNT_MAX, Math.round(value));
}

/** 完播率按百分比填写（35 表示 35%），提交前归一化到 0–1。 */
export function toRateInput(raw: string): number | null {
  const text = raw.trim().replace("%", "");
  if (text.length === 0) {
    return null;
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(1, Math.round(normalized * 10_000) / 10_000);
}

/** 单条录入：所有数据由用户手动填写，不做任何平台抓取。 */
export function PostForm({ onCreated }: { onCreated?: (post: PostDto) => void }) {
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]): void {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(): Promise<void> {
    if (values.title.trim().length === 0) {
      setError("请先填写作品标题");
      return;
    }
    if (values.publishedAt.trim().length === 0) {
      setError("请选择发布时间");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    const payload: Record<string, unknown> = {
      title: values.title.trim(),
      publishedAt: values.publishedAt.trim(),
      completionRate: toRateInput(values.completionRate),
      note: values.note.trim(),
    };

    if (values.platform.length > 0) {
      payload["platform"] = values.platform;
    }
    for (const field of POST_COUNT_FIELDS) {
      payload[field.key] = toCountInput(values[field.key]);
    }
    if (values.note.trim().length === 0) {
      delete payload["note"];
    }

    const result = await apiRequest<{ post: PostDto }>("/api/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setValues(EMPTY);
    setNotice(`已录入「${result.data.post.title}」`);
    onCreated?.(result.data.post);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>手动录入作品</CardTitle>
        <CardDescription>
          数据只来自你手动填写；留空的字段会按「未提供」处理，不会参与基线统计。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="作品标题" htmlFor="post-title" hint={`必填，最多 ${POST_TITLE_MAX} 字`}>
            <Input
              id="post-title"
              value={values.title}
              maxLength={POST_TITLE_MAX}
              disabled={saving}
              placeholder="例如：3 个动作让新手口播不尬场"
              onChange={(event) => update("title", event.target.value)}
            />
          </Field>

          <Field label="发布时间" htmlFor="post-published-at" hint="必填，按北京时间记录">
            <Input
              id="post-published-at"
              type="date"
              value={values.publishedAt}
              disabled={saving}
              onChange={(event) => update("publishedAt", event.target.value)}
            />
          </Field>

          <Field label="平台" htmlFor="post-platform" hint="留空则跟随账号画像">
            <Select
              id="post-platform"
              value={values.platform}
              disabled={saving}
              onChange={(event) => update("platform", event.target.value)}
            >
              <option value="">跟随画像</option>
              {PLATFORMS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="完播率（%）" htmlFor="post-completion" hint="填 35 表示 35%，可留空">
            <Input
              id="post-completion"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={values.completionRate}
              disabled={saving}
              onChange={(event) => update("completionRate", event.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {POST_COUNT_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={`post-${field.key}`}>
              <Input
                id={`post-${field.key}`}
                type="number"
                min={0}
                inputMode="numeric"
                value={values[field.key]}
                disabled={saving}
                onChange={(event) => update(field.key, event.target.value)}
              />
            </Field>
          ))}
        </div>

        <Field label="备注（可选）" htmlFor="post-note" hint="例如：这条是跟热点发的">
          <Textarea
            id="post-note"
            value={values.note}
            maxLength={200}
            disabled={saving}
            className="min-h-[60px]"
            onChange={(event) => update("note", event.target.value)}
          />
        </Field>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <Button onClick={() => void submit()} disabled={saving}>
          {saving ? "保存中…" : "保存这条数据"}
        </Button>
      </CardContent>
    </Card>
  );
}