import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ScriptDetail } from "@/components/scripts/script-detail";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/session";
import { PLATFORMS, optionLabel } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toScriptDto } from "@/lib/dto";

export const metadata: Metadata = { title: "脚本详情" };

type Snapshot = {
  capturedAt?: string;
  promptVersion?: string;
  name?: string;
  platform?: string;
  niche?: string;
  subNiche?: string;
  followerCount?: number | null;
};

function parseSnapshot(raw: string): Snapshot | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object") {
      return parsed as Snapshot;
    }
  } catch {
    // 快照损坏不影响页面其他部分
  }
  return null;
}

export default async function ScriptDetailPage({ params }: { params: { id: string } }) {
  const user = await requireProfile();

  // 查询必须带 userId：他人的脚本一律 404
  const script = await prisma.script.findFirst({
    where: { id: params.id, userId: user.id },
  });

  if (!script) {
    notFound();
  }

  const snapshot = parseSnapshot(script.profileSnapshot);
  const dto = toScriptDto(script);

  return (
    <div className="space-y-6">
      <PageHeader
        title="脚本详情"
        description="查看、编辑与复制；编辑保存后会标记为「人工编辑」，不会覆盖历史版本。"
        actions={
          <Link href="/scripts" className={buttonVariants({ variant: "outline" })}>
            返回脚本列表
          </Link>
        }
      />

      <ScriptDetail script={dto} />

      <Card>
        <CardHeader>
          <CardTitle>生成信息</CardTitle>
          <CardDescription>
            记录这条脚本是基于哪份画像与哪个选题生成的，后续修改画像不影响历史记录。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">生成时间</dt>
              <dd>{script.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">最后修改</dt>
              <dd>
                {script.editedAt
                  ? script.editedAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">来源</dt>
              <dd>{script.source === "ai" ? "AI 生成" : "人工编辑"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">模型</dt>
              <dd>{script.model ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">来源选题</dt>
              <dd>
                {script.topicId ? (
                  <Link href={`/topics/${script.topicId}`} className="text-primary hover:underline">
                    {dto.topicTitle ?? "查看选题"}
                  </Link>
                ) : (
                  (dto.topicTitle ?? "手动创建")
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">目标时长</dt>
              <dd>{script.durationSec ? `${script.durationSec} 秒` : "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Prompt 版本</dt>
              <dd>{snapshot?.promptVersion ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">画像快照</dt>
              <dd>
                {snapshot
                  ? [
                      snapshot.name,
                      optionLabel(PLATFORMS, snapshot.platform),
                      snapshot.subNiche
                        ? `${snapshot.niche}（${snapshot.subNiche}）`
                        : snapshot.niche,
                      typeof snapshot.followerCount === "number"
                        ? `${snapshot.followerCount} 粉`
                        : null,
                    ]
                      .filter((item) => item !== null && item !== undefined && item !== "")
                      .join(" · ")
                  : "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}