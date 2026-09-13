"use client";

import { REVIEW_DIMENSIONS } from "@/lib/ai/schemas/review";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * 复盘编辑器：AI 降级草稿与已保存报告共用同一份表单，
 * 保证「草稿补全后保存」与「报告直接修改」两条路径的结构完全一致。
 */

export type ReviewDiagnosticValue = {
  dimension: string;
  verdict: string;
  evidence: string;
  suggestion: string;
};

export type ReviewNextTopicValue = { title: string; reason: string };

export type ReviewEditorValue = {
  summary: string;
  diagnostics: ReviewDiagnosticValue[];
  /** 每行一条，保存时按行拆分 */
  highlights: string;
  problems: string;
  suggestions: string;
  nextTopics: ReviewNextTopicValue[];
  baselineNote: string;
};

type LooseDiagnostic = Partial<ReviewDiagnosticValue>;
type LooseNextTopic = Partial<ReviewNextTopicValue>;

/** 宽松入参：既能吃 ReviewDraft，也能吃服务端返回的 ReviewDto。 */
export type LooseReview = {
  summary?: string;
  diagnostics?: LooseDiagnostic[];
  highlights?: string[];
  problems?: string[];
  suggestions?: string[];
  nextTopics?: LooseNextTopic[];
  baselineNote?: string;
};

function toLines(items: string[] | undefined): string {
  return (items ?? []).filter((item) => item.trim().length > 0).join("\n");
}

export function toEditorValue(review: LooseReview): ReviewEditorValue {
  return {
    summary: review.summary ?? "",
    diagnostics: (review.diagnostics ?? []).map((item) => ({
      dimension: item.dimension ?? "",
      verdict: item.verdict ?? "",
      evidence: item.evidence ?? "",
      suggestion: item.suggestion ?? "",
    })),
    highlights: toLines(review.highlights),
    problems: toLines(review.problems),
    suggestions: toLines(review.suggestions),
    nextTopics: (review.nextTopics ?? []).map((item) => ({
      title: item.title ?? "",
      reason: item.reason ?? "",
    })),
    baselineNote: review.baselineNote ?? "",
  };
}

function fromLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export type ReviewSavePayload = {
  summary: string;
  diagnostics: Array<{ dimension: string; verdict: string; evidence: string; suggestion: string }>;
  highlights: string[];
  problems: string[];
  suggestions: string[];
  nextTopics: Array<{ title: string; reason: string }>;
  baselineNote: string;
};

/** 空行会被丢弃；诊断与选题只保留至少有一个字段有内容的行。 */
export function toSavePayload(value: ReviewEditorValue): ReviewSavePayload {
  return {
    summary: value.summary.trim(),
    diagnostics: value.diagnostics
      .map((item) => ({
        dimension: item.dimension.trim(),
        verdict: item.verdict.trim(),
        evidence: item.evidence.trim(),
        suggestion: item.suggestion.trim(),
      }))
      .filter(
        (item) =>
          item.verdict.length > 0 || item.evidence.length > 0 || item.suggestion.length > 0,
      ),
    highlights: fromLines(value.highlights),
    problems: fromLines(value.problems),
    suggestions: fromLines(value.suggestions),
    nextTopics: value.nextTopics
      .map((item) => ({ title: item.title.trim(), reason: item.reason.trim() }))
      .filter((item) => item.title.length > 0),
    baselineNote: value.baselineNote.trim(),
  };
}

const EMPTY_DIAGNOSTIC: ReviewDiagnosticValue = {
  dimension: "",
  verdict: "",
  evidence: "",
  suggestion: "",
};

const EMPTY_NEXT_TOPIC: ReviewNextTopicValue = { title: "", reason: "" };

export function emptyEditorValue(): ReviewEditorValue {
  return {
    summary: "",
    diagnostics: [{ ...EMPTY_DIAGNOSTIC }],
    highlights: "",
    problems: "",
    suggestions: "",
    nextTopics: [{ ...EMPTY_NEXT_TOPIC }],
    baselineNote: "",
  };
}

export function ReviewEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: ReviewEditorValue;
  onChange: (value: ReviewEditorValue) => void;
  disabled?: boolean;
}) {
  function update(patch: Partial<ReviewEditorValue>): void {
    onChange({ ...value, ...patch });
  }

  function updateDiagnostic(index: number, patch: Partial<ReviewDiagnosticValue>): void {
    const diagnostics = value.diagnostics.map((item, position) =>
      position === index ? { ...item, ...patch } : item,
    );
    update({ diagnostics });
  }

  function updateNextTopic(index: number, patch: Partial<ReviewNextTopicValue>): void {
    const nextTopics = value.nextTopics.map((item, position) =>
      position === index ? { ...item, ...patch } : item,
    );
    update({ nextTopics });
  }

  return (
    <div className="space-y-4">
      <Field label="结论摘要" htmlFor="review-summary" hint="建议 300 字以内">
        <Textarea
          id="review-summary"
          value={value.summary}
          maxLength={400}
          disabled={disabled}
          onChange={(event) => update({ summary: event.target.value })}
        />
      </Field>

      <div className="space-y-3">
        <p className="text-sm font-medium">分维度诊断</p>
        {value.diagnostics.map((item, index) => (
          <div key={index} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <Select
                value={item.dimension}
                disabled={disabled}
                aria-label={`第 ${index + 1} 条诊断维度`}
                className="max-w-[180px]"
                onChange={(event) => updateDiagnostic(index, { dimension: event.target.value })}
              >
                <option value="">（选择维度）</option>
                {REVIEW_DIMENSIONS.map((dimension) => (
                  <option key={dimension} value={dimension}>
                    {dimension}
                  </option>
                ))}
              </Select>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => update({ diagnostics: value.diagnostics.filter((_, i) => i !== index) })}
              >
                删除
              </Button>
            </div>
            <Input
              value={item.verdict}
              maxLength={120}
              disabled={disabled}
              placeholder="结论（≤ 80 字）"
              onChange={(event) => updateDiagnostic(index, { verdict: event.target.value })}
            />
            <Input
              value={item.evidence}
              maxLength={160}
              disabled={disabled}
              placeholder="数据依据（≤ 120 字）"
              onChange={(event) => updateDiagnostic(index, { evidence: event.target.value })}
            />
            <Input
              value={item.suggestion}
              maxLength={160}
              disabled={disabled}
              placeholder="改进建议（≤ 120 字）"
              onChange={(event) => updateDiagnostic(index, { suggestion: event.target.value })}
            />
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || value.diagnostics.length >= 5}
          onClick={() => update({ diagnostics: [...value.diagnostics, { ...EMPTY_DIAGNOSTIC }] })}
        >
          添加一条诊断
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="做对的地方" htmlFor="review-highlights" hint="每行一条，最多 4 条">
          <Textarea
            id="review-highlights"
            value={value.highlights}
            disabled={disabled}
            onChange={(event) => update({ highlights: event.target.value })}
          />
        </Field>
        <Field label="暴露的问题" htmlFor="review-problems" hint="每行一条，最多 4 条">
          <Textarea
            id="review-problems"
            value={value.problems}
            disabled={disabled}
            onChange={(event) => update({ problems: event.target.value })}
          />
        </Field>
        <Field label="下一步建议" htmlFor="review-suggestions" hint="每行一条，最多 5 条">
          <Textarea
            id="review-suggestions"
            value={value.suggestions}
            disabled={disabled}
            onChange={(event) => update({ suggestions: event.target.value })}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">下一批选题</p>
        {value.nextTopics.map((item, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Input
              value={item.title}
              maxLength={60}
              disabled={disabled}
              className="sm:max-w-[240px]"
              placeholder="选题标题"
              onChange={(event) => updateNextTopic(index, { title: event.target.value })}
            />
            <Input
              value={item.reason}
              maxLength={160}
              disabled={disabled}
              className="sm:flex-1"
              placeholder="推荐理由"
              onChange={(event) => updateNextTopic(index, { reason: event.target.value })}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => update({ nextTopics: value.nextTopics.filter((_, i) => i !== index) })}
            >
              删除
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || value.nextTopics.length >= 3}
          onClick={() => update({ nextTopics: [...value.nextTopics, { ...EMPTY_NEXT_TOPIC }] })}
        >
          添加一条选题
        </Button>
      </div>

      <Field label="基线口径说明" htmlFor="review-baseline-note" hint="例如：对比账号历史 12 条作品的播放中位数">
        <Input
          id="review-baseline-note"
          value={value.baselineNote}
          maxLength={160}
          disabled={disabled}
          onChange={(event) => update({ baselineNote: event.target.value })}
        />
      </Field>
    </div>
  );
}