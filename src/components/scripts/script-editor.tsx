"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SCRIPT_DURATION_MAX_SEC, SCRIPT_OUTLINE_MAX, SCRIPT_TITLES_MAX } from "@/lib/constants";

/**
 * 脚本编辑器：AI 降级草稿与脚本详情共用同一套受控表单。
 * 这里只负责「编辑 + 校验」，落库走 POST /api/scripts 或 PATCH /api/scripts/[id]。
 */

export type ScriptOutlineRow = {
  section: string;
  seconds: number;
  content: string;
  visual: string;
};

export type ScriptEditorValue = {
  titles: string[];
  hook: string;
  outline: ScriptOutlineRow[];
  tags: string[];
  coverCopy: string;
  cta: string;
};

export function emptyOutlineRow(): ScriptOutlineRow {
  return { section: "", seconds: 0, content: "", visual: "" };
}

export function toEditorValue(input: {
  titles: string[];
  hook: string;
  outline: { section: string; seconds: number; content: string; visual?: string }[];
  tags: string[];
  coverCopy: string;
  cta: string;
}): ScriptEditorValue {
  return {
    titles: input.titles.length > 0 ? [...input.titles] : [""],
    hook: input.hook,
    outline:
      input.outline.length > 0
        ? input.outline.map((item) => ({
            section: item.section,
            seconds: item.seconds,
            content: item.content,
            visual: item.visual ?? "",
          }))
        : [emptyOutlineRow()],
    tags: [...input.tags],
    coverCopy: input.coverCopy,
    cta: input.cta,
  };
}

/** 逗号（中英文）与顿号分隔的标签输入。 */
export function splitTags(raw: string): string[] {
  return raw
    .split(/[,，、]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 10);
}

/** 保存前的本地校验；返回第一条错误信息，全部合法则返回 null。 */
export function validateEditorValue(value: ScriptEditorValue): string | null {
  const titles = value.titles.map((title) => title.trim()).filter((title) => title.length > 0);

  if (titles.length === 0) {
    return "请至少填写 1 个标题候选";
  }
  if (titles.some((title) => title.length > 40)) {
    return "标题最多 40 字";
  }
  if (value.hook.trim().length > 200) {
    return "开头钩子最多 200 字";
  }
  if (value.outline.length > SCRIPT_OUTLINE_MAX) {
    return `分段脚本最多 ${SCRIPT_OUTLINE_MAX} 段`;
  }
  if (value.coverCopy.trim().length > 40) {
    return "封面文案最多 40 字";
  }
  if (value.cta.trim().length > 120) {
    return "结尾引导最多 120 字";
  }

  return null;
}

/** 编辑器值 -> 接口入参（去掉空分段，避免存下无意义的空行）。 */
export function toSavePayload(value: ScriptEditorValue): {
  titles: string[];
  hook: string;
  outline: { section: string; seconds: number; content: string; visual: string }[];
  tags: string[];
  coverCopy: string;
  cta: string;
} {
  return {
    titles: value.titles.map((title) => title.trim()).filter((title) => title.length > 0),
    hook: value.hook.trim(),
    outline: value.outline
      .filter((item) => item.section.trim().length > 0 || item.content.trim().length > 0)
      .map((item) => ({
        section: item.section.trim(),
        seconds: Math.max(0, Math.round(item.seconds)),
        content: item.content.trim(),
        visual: item.visual.trim(),
      })),
    tags: value.tags,
    coverCopy: value.coverCopy.trim(),
    cta: value.cta.trim(),
  };
}

export function ScriptEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: ScriptEditorValue;
  onChange: (next: ScriptEditorValue) => void;
  disabled?: boolean;
}) {
  function patch(partial: Partial<ScriptEditorValue>): void {
    onChange({ ...value, ...partial });
  }

  function updateTitle(index: number, title: string): void {
    patch({ titles: value.titles.map((item, itemIndex) => (itemIndex === index ? title : item)) });
  }

  function updateOutline(index: number, partial: Partial<ScriptOutlineRow>): void {
    patch({
      outline: value.outline.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...partial } : item,
      ),
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">标题候选（第 1 条为主标题）</p>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || value.titles.length >= SCRIPT_TITLES_MAX}
            onClick={() => patch({ titles: [...value.titles, ""] })}
          >
            <Plus className="h-4 w-4" />
            加一个
          </Button>
        </div>

        {value.titles.map((title, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={title}
              maxLength={40}
              disabled={disabled}
              placeholder={index === 0 ? "主标题" : `备选标题 ${index + 1}`}
              onChange={(event) => updateTitle(index, event.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled || value.titles.length <= 1}
              aria-label="删除该标题"
              title="删除该标题"
              onClick={() =>
                patch({ titles: value.titles.filter((_, itemIndex) => itemIndex !== index) })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Field
        label="开头钩子"
        htmlFor="script-hook"
        hint={`前 3 秒要说什么；已填 ${value.hook.length}/200`}
      >
        <Textarea
          id="script-hook"
          value={value.hook}
          maxLength={200}
          disabled={disabled}
          className="min-h-[72px]"
          onChange={(event) => patch({ hook: event.target.value })}
        />
      </Field>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">分段脚本</p>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || value.outline.length >= SCRIPT_OUTLINE_MAX}
            onClick={() => patch({ outline: [...value.outline, emptyOutlineRow()] })}
          >
            <Plus className="h-4 w-4" />
            加一段
          </Button>
        </div>

        {value.outline.map((item, index) => (
          <div key={index} className="space-y-3 rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">第 {index + 1} 段</p>
              <Button
                variant="ghost"
                size="icon"
                disabled={disabled || value.outline.length <= 1}
                aria-label="删除该段"
                title="删除该段"
                onClick={() =>
                  patch({ outline: value.outline.filter((_, itemIndex) => itemIndex !== index) })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="段落标题" htmlFor={`script-section-${index}`}>
                <Input
                  id={`script-section-${index}`}
                  value={item.section}
                  maxLength={40}
                  disabled={disabled}
                  onChange={(event) => updateOutline(index, { section: event.target.value })}
                />
              </Field>

              <Field label="时长（秒）" htmlFor={`script-seconds-${index}`} hint="0–300">
                <Input
                  id={`script-seconds-${index}`}
                  type="number"
                  min={0}
                  max={SCRIPT_DURATION_MAX_SEC}
                  value={String(item.seconds)}
                  disabled={disabled}
                  onChange={(event) =>
                    updateOutline(index, {
                      seconds: Math.max(0, Math.min(300, Number(event.target.value) || 0)),
                    })
                  }
                />
              </Field>

              <Field label="画面提示（可选）" htmlFor={`script-visual-${index}`}>
                <Input
                  id={`script-visual-${index}`}
                  value={item.visual}
                  maxLength={300}
                  disabled={disabled}
                  onChange={(event) => updateOutline(index, { visual: event.target.value })}
                />
              </Field>
            </div>

            <Field label="口播稿" htmlFor={`script-content-${index}`} hint="可直接照读，不要留占位">
              <Textarea
                id={`script-content-${index}`}
                value={item.content}
                maxLength={800}
                disabled={disabled}
                className="min-h-[96px]"
                onChange={(event) => updateOutline(index, { content: event.target.value })}
              />
            </Field>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="标签"
          htmlFor="script-tags"
          hint="用逗号分隔，最多 10 个"
        >
          <Input
            id="script-tags"
            value={value.tags.join("，")}
            disabled={disabled}
            onChange={(event) => patch({ tags: splitTags(event.target.value) })}
          />
        </Field>

        <Field
          label="封面文案"
          htmlFor="script-cover"
          hint={`最多 40 字；已填 ${value.coverCopy.length}/40`}
        >
          <Input
            id="script-cover"
            value={value.coverCopy}
            maxLength={40}
            disabled={disabled}
            onChange={(event) => patch({ coverCopy: event.target.value })}
          />
        </Field>
      </div>

      <Field
        label="结尾引导（可选）"
        htmlFor="script-cta"
        hint={`最多 120 字；已填 ${value.cta.length}/120`}
      >
        <Input
          id="script-cta"
          value={value.cta}
          maxLength={120}
          disabled={disabled}
          onChange={(event) => patch({ cta: event.target.value })}
        />
      </Field>
    </div>
  );
}