import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { TopicCard } from "@/components/topics/topic-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/session";
import { PLATFORMS, optionLabel } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toTopicDto } from "@/lib/dto";

export const metadata: Metadata = { title: "选题详情" };

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

export default async function TopicDetailPage({ params }: { params: { id: string } }) {
  const user = await requireProfile();

  // 查询必须带 userId：他人的选题一律 404
  const topic = await prisma.topicIdea.findFirst({
    where: { id: params.id, userId: user.id },
  });

  if (!topic) {
    notFound();
  }

  const snapshot = parseSnapshot(topic.profileSnapshot);

  return (
    <div className="space-y-6">
      <PageHeader
        title="选题详情"
        description="查看完整理由与参考方向；生成脚本将在 P3 开放。"
        actions={
          <Link href="/topics" className={buttonVariants({ variant: "outline" })}>
            返回选题列表
          </Link>
        }
      />

      <TopicCard topic={toTopicDto(topic)} showDetailLink={false} />

      <Card>
        <CardHeader>
          <CardTitle>生成信息</CardTitle>
          <CardDescription>
            记录这条选题是基于哪份画像生成的，画像后续修改不影响历史记录。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">生成时间</dt>
              <dd>{topic.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">来源</dt>
              <dd>{topic.source === "ai" ? "AI 生成" : "手动保存"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">模型</dt>
              <dd>{topic.model ?? "—"}</dd>
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
