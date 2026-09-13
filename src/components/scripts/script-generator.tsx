"use client";

import { RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ScriptCard } from "@/components/scripts/script-card";
import {
  ScriptEditor,
  toEditorValue,
  toSavePayload,
  validateEditorValue,
  type ScriptEditorValue,
} from "@/components/scripts/script-editor";
import { Badge } from "@/components/ui/badge";
import { QuotaHint } from "@/components/quota/quota-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { scriptDraftSchema } from "@/lib/ai/schemas/script";
import { apiRequest } from "@/lib/client/api";
import { streamSse, SseRequestError } from "@/lib/client/sse";
import { SCRIPT_DURATION_DEFAULT_SEC, SCRIPT_DURATION_MAX_SEC, SCRIPT_DURATION_MIN_SEC } from "@/lib/constants";
import type { ScriptDto, ScriptUsage, SseScriptError } from "@/lib/scripts/schemas";

const PHASE_LABEL: Record<string, string> = {
  calling: "正在请求模型…",
  parsing: "正在解析模型输出…",
  validating: "正在校验格式…",
  repairing: "格式不符，正在自动修复（第 2 次尝试）…",
};

type Status = "idle" | "running" | "done" | "draft" | "error";

export function ScriptGenerator({
  topicId,
  topicTitle,
  initialUsage,
  autoStart = false,
}: {
  /** 来源选题；手动输入标题时为 null */
  topicId: string | null;
  topicTitle: string | null;
  initialUsage: ScriptUsage;
  /** 从选题进入时自动开始生成一次 */
  autoStart?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [script, setScript] = useState<ScriptDto | null>(null);
  const [draft, setDraft] = useState<ScriptEditorValue | null>(null);
  const [progress, setProgress] = useState<{ phase: string; chars: number } | null>(null);
  const [usage, setUsage] = useState<ScriptUsage>(initialUsage);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [extraNote, setExtraNote] = useState("");
  const [durationSec, setDurationSec] = useState(SCRIPT_DURATION_DEFAULT_SEC);
  const [manualTitle, setManualTitle] = useState(topicTitle ?? "");
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const autoStartedRef = useRef(false);

  const scriptExhausted = usage.script.used >= usage.script.limit;
  const dailyExhausted = usage.aiDaily.used >= usage.aiDaily.limit;
  const running = status === "running";

  function handleStreamError(data: SseScriptError): void {
    setProgress(null);
    setErrorCode(data.code);
    setErrorMessage(data.message);

    if (data.code === "AI_INVALID_OUTPUT") {
      const rawDetails = data.details;
      const rawDraft =
        rawDetails !== null && typeof rawDetails === "object" && "draft" in rawDetails
          ? (rawDetails as { draft?: unknown }).draft
          : undefined;
      const parsed = scriptDraftSchema.safeParse(rawDraft);

      setDraft(
        parsed.success
          ? toEditorValue(parsed.data)
          : toEditorValue({
              titles: topicTitle ? [topicTitle] : [""],
              hook: "",
              outline: [],
              tags: [],
              coverCopy: "",
              cta: "",
            }),
      );
      setStatus("draft");
      return;
    }

    if (data.code === "QUOTA_EXCEEDED" || data.code === "RATE_LIMITED") {
      setNotice("额度信息可在「设置」页查看。");
    }

    setStatus("error");
  }

  async function generate(): Promise<void> {
    const trimmedTitle = manualTitle.trim();

    if (!topicId && trimmedTitle.length === 0) {
      setStatus("error");
      setErrorCode("VALIDATION_FAILED");
      setErrorMessage("请先填写一个标题，或从选题页选择一条选题");
      return;
    }

    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    let settled = false;

    setStatus("running");
    setScript(null);
    setDraft(null);
    setErrorCode(null);
    setErrorMessage(null);
    setNotice(null);
    setProgress({ phase: "calling", chars: 0 });

    const payload: Record<string, unknown> = {
      durationSec,
    };
    if (extraNote.trim().length > 0) {
      payload["extraNote"] = extraNote.trim();
    }
    if (topicId) {
      payload["topicId"] = topicId;
    } else {
      payload["title"] = trimmedTitle;
    }

    try {
      await streamSse(
        "/api/scripts/generate",
        payload,
        {
          onScriptMeta: (data) => setUsage(data.usage),
          onScriptProgress: (data) => setProgress({ phase: data.phase, chars: data.chars }),
          onScript: (data) => setScript(data.script),
          onScriptDone: (data) => {
            settled = true;
            setUsage(data.usage);
            setProgress(null);
            setStatus("done");
            setNotice(
              `已生成脚本，耗时 ${(data.latencyMs / 1000).toFixed(1)} 秒。` +
                "重新生成会产生一条新记录，历史版本仍保留在下方。",
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

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) {
      return;
    }
    autoStartedRef.current = true;
    void generate();
    // 只在首次挂载时自动生成一次；generate 依赖的表单值此时都是初始值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  function cancel(): void {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
    setStatus("idle");
  }

  async function saveDraft(): Promise<void> {
    if (!draft) {
      return;
    }

    const invalid = validateEditorValue(draft);
    if (invalid) {
      setErrorMessage(invalid);
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const result = await apiRequest<{ script: ScriptDto }>("/api/scripts", {
      method: "POST",
      body: JSON.stringify({
        ...(topicId ? { topicId } : {}),
        durationSec,
        ...toSavePayload(draft),
      }),
    });

    setSaving(false);

    if (!result.ok) {
      setErrorMessage(result.error.message);
      return;
    }

    setScript(result.data.script);
    setDraft(null);
    setErrorCode(null);
    setStatus("done");
    setNotice("草稿已保存到脚本历史。");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>生成脚本</CardTitle>
            <CardDescription>
              输出 3–5 个标题候选、开头钩子、分段口播稿、标签与封面文案。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">
              本月脚本 {usage.script.used}/{usage.script.limit}
            </Badge>
            <Badge variant="outline">
              今日 AI {usage.aiDaily.used}/{usage.aiDaily.limit}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {topicId ? (
          <div className="rounded-md border bg-muted/40 p-3 text-sm" role="status" aria-live="polite">
            <p className="text-xs text-muted-foreground">来源选题</p>
            <p className="font-medium">{topicTitle ?? "（已删除的选题）"}</p>
          </div>
        ) : (
          <Field label="脚本主题" htmlFor="script-manual-title" hint="也可以先去「选题」页挑一条选题">
            <Input
              id="script-manual-title"
              value={manualTitle}
              maxLength={60}
              disabled={running}
              placeholder="例如：3 个动作让新手口播不尬场"
              onChange={(event) => setManualTitle(event.target.value)}
            />
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="目标时长（秒）"
            htmlFor="script-duration"
            hint={`${SCRIPT_DURATION_MIN_SEC}–${SCRIPT_DURATION_MAX_SEC} 秒，默认 ${SCRIPT_DURATION_DEFAULT_SEC} 秒`}
          >
            <Input
              id="script-duration"
              type="number"
              min={SCRIPT_DURATION_MIN_SEC}
              max={SCRIPT_DURATION_MAX_SEC}
              step={15}
              value={String(durationSec)}
              disabled={running}
              onChange={(event) =>
                setDurationSec(
                  Math.max(
                    SCRIPT_DURATION_MIN_SEC,
                    Math.min(SCRIPT_DURATION_MAX_SEC, Number(event.target.value) || SCRIPT_DURATION_DEFAULT_SEC),
                  ),
                )
              }
            />
          </Field>

          <Field
            label="补充说明（可选）"
            htmlFor="script-extra-note"
            hint={`最多 200 字；已填 ${extraNote.length}/200`}
          >
            <Textarea
              id="script-extra-note"
              value={extraNote}
              maxLength={200}
              disabled={running}
              className="min-h-[42px]"
              placeholder="例如：这次想用对比结构，结尾引导评论"
              onChange={(event) => setExtraNote(event.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void generate()} disabled={running || scriptExhausted || dailyExhausted}>
            <Sparkles className="h-4 w-4" />
            {script ? "重新生成（新记录）" : "生成脚本"}
          </Button>

          {running ? (
            <Button variant="ghost" onClick={cancel}>
              <X className="h-4 w-4" />
              取消
            </Button>
          ) : null}

          {script ? (
            <Badge variant="secondary">
              <RefreshCw className="mr-1 h-3 w-3" />
              重新生成会保留当前版本
            </Badge>
          ) : null}
        </div>

        <QuotaHint label="脚本" scope="month" snapshot={usage.script} />
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

        {script ? <ScriptCard script={script} /> : null}

        {status === "draft" && draft ? (
          <div className="space-y-4 rounded-md border border-destructive/40 bg-destructive/5 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">模型输出格式异常，已降级为可编辑草稿</p>
              <p className="text-xs text-muted-foreground">
                本次生成不计入配额。请补全标题后保存，至少填写 1 个标题候选。
              </p>
            </div>

            <ScriptEditor value={draft} onChange={setDraft} disabled={saving} />

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveDraft()} disabled={saving}>
                {saving ? "保存中…" : "保存草稿为脚本"}
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