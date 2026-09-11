import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { PlaceholderPanel } from "@/components/placeholder-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { GOALS, PLATFORMS, optionLabel } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "概览" };

export default async function DashboardPage() {
  const user = await requireUser();

  const profile = await prisma.creatorProfile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`欢迎，${user.nickname ?? user.email}`}
          description="先花一分钟告诉我们你在做什么账号，后面的推荐才有依据。"
        />
        <Card>
          <CardHeader>
            <CardTitle>还差一步：创建账号画像</CardTitle>
            <CardDescription>选题推荐和脚本口吻都会基于画像定制，所以这一步必须先完成。</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/onboarding" className={buttonVariants()}>
              创建账号画像
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="概览" description="今天该发什么、最近表现如何，都汇总在这里。" />

      <Card>
        <CardHeader>
          <CardTitle>{profile.name}</CardTitle>
          <CardDescription>
            {optionLabel(PLATFORMS, profile.platform)} · {profile.niche} · 粉丝{" "}
            {profile.followerCount ?? "—"} · 目标 {optionLabel(GOALS, profile.goal)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
            编辑账号画像
          </Link>
        </CardContent>
      </Card>

      <PlaceholderPanel
        stage="P2"
        title="今日推荐"
        description="P1 只完成了账号与画像体系，选题推荐会在 P2 接入。"
        items={[
          "P2：根据你的平台与赛道生成 5 条可跟选题",
          "P3：由选题生成标题、开头与脚本框架",
          "P4：录入作品数据并生成复盘报告",
        ]}
      />
    </div>
  );
}