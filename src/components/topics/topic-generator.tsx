"use client";

import { RefreshCw, Sparkles, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";

import { TopicCard } from "@/components/topics/topic-card";
import { Badge } from "@/components/ui/badge";
import { QuotaHint } from "@/components/quota/quota-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { emptyDraftItem, topicDraftItemSchema, type TopicDraftItem } from "@/lib/ai/schemas/topic";
import { apiRequest } from "@/lib/client/api";
import { streamSse, SseRequestError } from "@/lib/client/sse";
import { TOPIC_BATCH_SIZE, TOPIC_EXCLUDE_TITLES_MAX } from "@/lib/constants";
import type { SseError, TopicDto, TopicUsage } from "@/lib/topics/schemas";

const draftListSchema = z.array(topicDraftItemSchema);

const PHASE_LABEL: Record<string, string> = {
  calling: "正在请求模型…",
  parsing: "正在解析模型输出…",
  validating: "正在校验格式…",
  repairing: "格式不符，正在自动修复（第 2 次尝试）…",
};

type Status = "idle" | "running" | "done" | "draft" | "error";

export function TopicGenerator({
  recentTitles,
  initialUsage,
}: {
  recentTitles: string[];
  initialUsage: TopicUsage;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [topics, setTopics] = useState<TopicDto[]>([]);
  const [draft, setDraft] = useState<TopicDraftItem[]>([]);
  const [progress, setProgress] = useState<{ phase: string; chars: number } | null>(null);
  const [usage, setUsage] = useState<TopicUsage>(initialUsage);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [extraNote, setExtraNote] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const topicExhausted = usage.topic.used >= usage.topic.limit;
  const dailyExhausted = usage.aiDaily.used >= usage.aiDaily.limit;

  /** 换一批时带上的「已生成标题」：本次结果 + 最近历史，最多 10 条。 */
  const excludeTitles = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];

    for (const title of [...topics.map((item) => item.title), ...recentTitles]) {
      const trimmed = title.trim();
      if (trimmed.length === 0 || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      merged.push(trimmed);
      if (merged.length >= TOPIC_EXCLUDE_TITLES_MAX) {
        break;
      }
    }

    return merged;
  }, [topics, recentTitles]);

  function handleStreamError(data: SseError): void {
    setProgress(null);
    setErrorCode(data.code);
    setErrorMessage(data.message);

    if (data.code === "AI_INVALID_OUTPUT") {
      const rawDetails = data.details;
      const rawDraft =
        rawDetails !== null && typeof rawDetails === "object" && "draft" in rawDetails
          ? (rawDetails as { draft?: unknown }).draft
          : undefined;
      const parsed = draftListSchema.safeParse(rawDraft);

      setDraft(
        parsed.success
          ? parsed.data
          : Array.from({ length: TOPIC_BATCH_SIZE }, () => emptyDraftItem()),
      );
      setStatus("draft");
      return;
    }

    if (data.code === "QUOTA_EXCEEDED" || data.code === "RATE_LIMITED") {
      setNotice("额度信息可在「设置」页查看。");
    }

    setStatus("error");
  }

  async function generate(mode: "fresh" | "more"): Promise<void> {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    let settled = false;

    setStatus("running");
    setTopics([]);
    setDraft([]);
    setErrorCode(null);
    setErrorMessage(null);
    setNotice(null);
    setProgress({ phase: "calling", chars: 0 });

    const payload: Record<string, unknown> = {};
    if (extraNote.trim().length > 0) {
      payload["extraNote"] = extraNote.trim();
    }
    if (mode === "more" && excludeTitles.length > 0) {
      payload["excludeTitles"] = excludeTitles;
    }

    try {
      await streamSse(
        "/api/topics/generate",
        payload,
        {
          onMeta: (data) => setUsage(data.usage),
          onProgress: (data) => setProgress({ phase: data.phase, chars: data.chars }),
          onTopic: (data) => setTopics((previous) => [...previous, data.topic]),
          onDone: (data) => {
            settled = true;
            setUsage(data.usage);
            setProgress(null);
            setStatus("done");
            setNotice(
              `已生成 ${data.created} 条选题，耗时 ${(data.latencyMs / 1000).toFixed(1)} 秒。` +
                "喜欢的记得收藏，换一批会自动避开这些标题。",
            );
          },
          onError: (data) => {
            settled = true;
            handleStreamError(data);
          },
        },
        controller.signal,
      );
    } catch (error) {
      setProgress(null);

      if (error instanceof SseRequestError) {
        if (error.code === "ABORTED") {
          setStatus("idle");
          return;
        }

        setStatus("error");
        setErrorCode(error.code);
        setErrorMessage(error.message);

        if (error.code === "QUOTA_EXCEEDED" || error.code === "RATE_LIMITED") {
          setNotice("额度信息可在「设置」页查看。");
        }
        return;
      }

      setStatus("error");
      setErrorMessage("生成失败，请稍后重试");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!settled && !controller.signal.aborted) {
        setProgress(null);
        setStatus("error");
        setErrorMessage("连接提前结束，请重试");
      }
    }
  }

  function cancel(): void {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
    setStatus("idle");
  }

  function updateDraftItem(index: number, patch: Partial<TopicDraftItem>): void {
    setDraft((previous) =>
      previous.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }

  async function saveDraft(): Promise<void> {
    const items = draft
      .filter((item) => item.title.trim().length > 0)
      .map((item) => ({
        title: item.title.trim(),
        angle: item.angle,
        reason: item.reason,
        referenceDirection: item.referenceDirection,
        keywords: item.keywords,
        score: item.score,
        difficulty: item.difficulty,
      }));

    if (items.length === 0) {
      setErrorMessage("请至少填写 1 条标题后再保存");
      return;
    }

    setSavingDraft(true);
    setErrorMessage(null);

    const result = await apiRequest<{ batchId: string; topics: TopicDto[] }>("/api/topics", {
      method: "POST",
      body: JSON.stringify({ items }),
    });

    setSavingDraft(false);

    if (!result.ok) {
      setErrorMessage(result.error.message);
      return;
    }

    setTopics(result.data.topics);
    setDraft([]);
    setErrorCode(null);
    setStatus("done");
    setNotice(`已保存 ${result.data.topics.length} 条选题到历史。`);
  }

  const running = status === "running";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>生成选题</CardTitle>
            <CardDescription>
              一次生成 {TOPIC_BATCH_SIZE} 条可跟选题，含推荐理由与参考方向。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">
              本月选题 {usage.topic.used}/{usage.topic.limit}
            </Badge>
            <Badge variant="outline">
              今日 AI {usage.aiDaily.used}/{usage.aiDaily.limit}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Field
          label="补充说明（可选）"
          htmlFor="topic-extra-note"
          hint={`最多 200 字，例如「这周想做一期面试复盘」；已填 ${extraNote.length}/200`}
        >
          <Textarea
            id="topic-extra-note"
            value={extraNote}
            maxLength={200}
            disabled={running}
            placeholder="想让这批选题更贴近什么场景？"
            onChange={(event) => setExtraNote(event.target.value)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void generate("fresh")}
            disabled={running || topicExhausted || dailyExhausted}
          >
            <Sparkles className="h-4 w-4" />
            {topics.length === 0 ? `生成 ${TOPIC_BATCH_SIZE} 条选题` : "重新生成"}
          </Button>

          <Button
            variant="outline"
            onClick={() => void generate("more")}
            disabled={running || topicExhausted || dailyExhausted}
            title={
              excludeTitles.length > 0
                ? `将避开最近 ${excludeTitles.length} 条标题`
                : "暂无历史标题可避开"
            }
          >
            <RefreshCw className="h-4 w-4" />
            换一批
          </Button>

          {running ? (
            <Button variant="ghost" onClick={cancel}>
              <X className="h-4 w-4" />
              取消
            </Button>
          ) : null}
        </div>

        <QuotaHint label="选题" scope="month" snapshot={usage.topic} />
        <QuotaHint label="AI 调用" scope="day" snapshot={usage.aiDaily} />

        {running && progress ? (
          <div className="rounded-md border bg-muted/40 p-3 text-sm" role="status" aria-live="polite">
            <p>{PHASE_LABEL[progress.phase] ?? "处理中…"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              已接收 {progress.chars} 字；只展示进度，不展示模型原文。
            </p>
          </div>
        ) : null}

        <p className="sr-only" role="status" aria-live="polite">
          {notice ?? ""}
          {errorMessage ?? ""}
        </p>
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        {errorMessage && status !== "draft" ? (
          <p role="alert" className="text-sm text-destructive">
            {errorCode ? `[${errorCode}] ` : ""}
            {errorMessage}
          </p>
        ) : null}

        {topics.length > 0 ? (
          <div className="space-y-3">
            {topics.map((topic, index) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                index={index}
                onChanged={(updated) =>
                  setTopics((previous) =>
                    previous.map((item) => (item.id === updated.id ? updated : item)),
                  )
                }
              />
            ))}
          </div>
        ) : null}

        {status === "draft" ? (
          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">模型输出格式异常，已降级为可编辑草稿</p>
              <p className="text-xs text-muted-foreground">
                本次生成不计入配额。请补全标题后保存，至少填写 1 条。
              </p>
            </div>

            {draft.map((item, index) => (
              <div key={index} className="space-y-3 rounded-md border bg-background p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">草稿 {index + 1}</Badge>
                </div>

                <Field label="标题" htmlFor={`draft-title-${index}`}>
                  <Input
                    id={`draft-title-${index}`}
                    value={item.title}
                    maxLength={40}
                    onChange={(event) => updateDraftItem(index, { title: event.target.value })}
                  />
                </Field>

                <Field label="切入角度" htmlFor={`draft-angle-${index}`}>
                  <Input
                    id={`draft-angle-${index}`}
                    value={item.angle}
                    maxLength={80}
                    onChange={(event) => updateDraftItem(index, { angle: event.target.value })}
                  />
                </Field>

                <Field label="推荐理由" htmlFor={`draft-reason-${index}`}>
                  <Textarea
                    id={`draft-reason-${index}`}
                    value={item.reason}
                    maxLength={400}
                    className="min-h-[72px]"
                    onChange={(event) => updateDraftItem(index, { reason: event.target.value })}
                  />
                </Field>

                <Field label="参考方向" htmlFor={`draft-direction-${index}`}>
                  <Textarea
                    id={`draft-direction-${index}`}
                    value={item.referenceDirection}
                    maxLength={400}
                    className="min-h-[72px]"
                    onChange={(event) =>
                      updateDraftItem(index, { referenceDirection: event.target.value })
                    }
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field
                    label="关键词"
                    htmlFor={`draft-keywords-${index}`}
                    hint="用逗号分隔，最多 6 个"
                  >
                    <Input
                      id={`draft-keywords-${index}`}
                      value={item.keywords.join("，")}
                      onChange={(event) =>
                        updateDraftItem(index, {
                          keywords: event.target.value
                            .split(/[,，、]/)
                            .map((keyword) => keyword.trim())
                            .filter((keyword) => keyword.length > 0)
                            .slice(0, 6),
                        })
                      }
                    />
                  </Field>

                  <Field label="评分" htmlFor={`draft-score-${index}`} hint="0–100">
                    <Input
                      id={`draft-score-${index}`}
                      type="number"
                      min={0}
                      max={100}
                      value={item.score === null ? "" : String(item.score)}
                      onChange={(event) =>
                        updateDraftItem(index, {
                          score:
                            event.target.value.trim().length === 0
                              ? null
                              : Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                        })
                      }
                    />
                  </Field>

                  <Field label="难度" htmlFor={`draft-difficulty-${index}`}>
                    <Select
                      id={`draft-difficulty-${index}`}
                      value={item.difficulty}
                      onChange={(event) =>
                        updateDraftItem(index, { difficulty: event.target.value })
                      }
                    >
                      <option value="">未指定</option>
                      <option value="low">易上手</option>
                      <option value="medium">中等</option>
                      <option value="high">有挑战</option>
                    </Select>
                  </Field>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveDraft()} disabled={savingDraft}>
                {savingDraft ? "保存中…" : "保存草稿为选题"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDraft([]);
                  setStatus("idle");
                }}
                disabled={savingDraft}
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
