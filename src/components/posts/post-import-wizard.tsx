"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/client/api";
import { POST_IMPORT_MAX_ROWS } from "@/lib/constants";
import {
  POST_FIELD_KEYS,
  POST_FIELD_LABELS,
  POST_REQUIRED_FIELDS,
  type CsvPreview,
  type PostFieldKey,
} from "@/lib/posts/csv";
import type { PostDto, PostInput } from "@/lib/posts/schemas";

const SAMPLE_CSV = [
  "标题,发布时间,曝光,播放,点赞,收藏,涨粉,完播率",
  "3 个动作让新手口播不尬场,2026-09-01,12000,3200,180,95,26,35%",
  "我踩过的 5 个剪辑坑,2026/9/3,8600,1900,74,31,8,28",
].join("\n");

type Step = "paste" | "mapping" | "preview";

/** CSV 粘贴导入：三步向导（粘贴 -> 确认列映射 -> 预览并提交），预览阶段不写库。 */
export function PostImportWizard({ onImported }: { onImported?: (posts: PostDto[]) => void }) {
  const [step, setStep] = useState<Step>("paste");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, PostFieldKey>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const validRows = useMemo(
    () => (preview ? preview.rows.filter((row) => row.data !== null) : []),
    [preview],
  );

  async function requestPreview(nextMapping?: Record<string, PostFieldKey>): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);

    const payload: Record<string, unknown> = { csv };
    if (nextMapping !== undefined && Object.keys(nextMapping).length > 0) {
      payload["mapping"] = nextMapping;
    }

    const result = await apiRequest<CsvPreview>("/api/posts/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setPreview(result.data);
    setMapping(result.data.mapping);
    setStep(nextMapping === undefined ? "mapping" : "preview");
  }

  async function commit(): Promise<void> {
    if (validRows.length === 0) {
      setError("没有可导入的有效行");
      return;
    }

    setBusy(true);
    setError(null);

    const result = await apiRequest<{ created: number; posts: PostDto[] }>(
      "/api/posts/import/commit",
      {
        method: "POST",
        body: JSON.stringify({
          rows: validRows.map((row) => row.data as PostInput),
          source: "csv",
        }),
      },
    );

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setNotice(`已导入 ${result.data.created} 条作品数据`);
    setPreview(null);
    setMapping({});
    setCsv("");
    setStep("paste");
    onImported?.(result.data.posts);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>粘贴 CSV 批量导入</CardTitle>
          <Badge variant="secondary">
            {step === "paste" ? "第 1 步 / 粘贴" : step === "mapping" ? "第 2 步 / 列映射" : "第 3 步 / 预览"}
          </Badge>
        </div>
        <CardDescription>
          从表格或平台后台复制后直接粘贴（支持 CSV 与制表符），预览确认无误再落库，不会自动去重。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {step === "paste" ? (
          <>
            <Field
              label="粘贴表格内容"
              htmlFor="post-csv"
              hint={`第一行需为表头；单次最多 ${POST_IMPORT_MAX_ROWS} 行`}
            >
              <Textarea
                id="post-csv"
                value={csv}
                disabled={busy}
                className="min-h-[160px] font-mono text-xs"
                placeholder={"标题,发布时间,曝光,播放,点赞,收藏,涨粉,完播率\n…"}
                onChange={(event) => setCsv(event.target.value)}
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void requestPreview()} disabled={busy || csv.trim().length === 0}>
                {busy ? "解析中…" : "解析并预览"}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setCsv(SAMPLE_CSV)}>
                填入示例数据
              </Button>
            </div>
          </>
        ) : null}

        {step === "mapping" && preview ? (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium">确认列映射</p>
              <p className="text-xs text-muted-foreground">
                系统已按表头别名自动识别；识别错误的列可在这里手动改，未识别的列会被忽略。
              </p>
            </div>

            <div className="space-y-2">
              {preview.columns.map((column, index) => (
                <div key={`${column}-${index}`} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm" title={column}>
                    {column.trim().length > 0 ? column : `（第 ${index + 1} 列）`}
                  </span>
                  <Select
                    value={mapping[String(index)] ?? ""}
                    disabled={busy}
                    onChange={(event) => {
                      const value = event.target.value;
                      setMapping((previous) => {
                        const next = { ...previous };
                        if (value.length === 0) {
                          delete next[String(index)];
                        } else {
                          next[String(index)] = value as PostFieldKey;
                        }
                        return next;
                      });
                    }}
                  >
                    <option value="">（忽略此列）</option>
                    {POST_FIELD_KEYS.map((field) => (
                      <option key={field} value={field}>
                        {POST_FIELD_LABELS[field]}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            {preview.unmatched.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                未识别列（将被忽略）：{preview.unmatched.join("、")}
              </p>
            ) : null}

            {POST_REQUIRED_FIELDS.filter((field) => !Object.values(mapping).includes(field)).length >
            0 ? (
              <p className="text-sm text-destructive">
                还缺少必填列：
                {POST_REQUIRED_FIELDS.filter((field) => !Object.values(mapping).includes(field))
                  .map((field) => POST_FIELD_LABELS[field])
                  .join("、")}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void requestPreview(mapping)} disabled={busy}>
                {busy ? "校验中…" : "确认映射并校验"}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setStep("paste")}>
                返回修改内容
              </Button>
            </div>
          </>
        ) : null}

        {step === "preview" && preview ? (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">共 {preview.summary.total} 行</Badge>
              <Badge variant="secondary">可导入 {preview.summary.valid} 行</Badge>
              {preview.summary.invalid > 0 ? (
                <Badge variant="destructive">有错误 {preview.summary.invalid} 行</Badge>
              ) : null}
              {preview.summary.duplicate > 0 ? (
                <Badge variant="outline">疑似重复 {preview.summary.duplicate} 行</Badge>
              ) : null}
            </div>

            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2">行号</th>
                    <th className="p-2">标题</th>
                    <th className="p-2">发布时间</th>
                    <th className="p-2">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 100).map((row) => (
                    <tr key={row.index} className="border-t">
                      <td className="p-2 tabular-nums">{row.index}</td>
                      <td className="p-2">{row.data?.title ?? (row.raw[0] ?? "")}</td>
                      <td className="p-2 tabular-nums">
                        {row.data ? row.data.publishedAt.slice(0, 10) : "—"}
                      </td>
                      <td className="p-2">
                        {row.errors.length > 0 ? (
                          <span className="text-destructive">{row.errors.join("；")}</span>
                        ) : row.duplicate ? (
                          <span className="text-muted-foreground">疑似重复（标题 + 发布时间一致）</span>
                        ) : (
                          <span className="text-muted-foreground">可导入</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void commit()} disabled={busy || validRows.length === 0}>
                {busy ? "导入中…" : `导入 ${validRows.length} 条`}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setStep("mapping")}>
                返回调整列映射
              </Button>
            </div>

            {preview.summary.invalid > 0 ? (
              <p className="text-xs text-muted-foreground">
                有错误的行会被跳过，修正后可重新粘贴导入。
              </p>
            ) : null}
          </>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      </CardContent>
    </Card>
  );
}