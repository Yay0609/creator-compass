import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { QuotaMeter } from "@/components/quota/quota-meter";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { GOALS, PLATFORMS, optionLabel } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { readUsage } from "@/lib/quota/usage";

export const metadata: Metadata = { title: "概览" };

export const dynamic = "force-dynamic";

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

  const [topicCount, scriptCount, postCount, reviewCount, usage] = await Promise.all([
    prisma.topicIdea.count({ where: { userId: user.id, isDiscarded: false } }),
    prisma.script.count({ where: { userId: user.id, isDiscarded: false } }),
    prisma.postRecord.count({ where: { userId: user.id } }),
    prisma.reviewReport.count({ where: { userId: user.id, isDiscarded: false } }),
    readUsage(user.id),
  ]);

  const steps = [
    { href: "/topics", label: "选题", count: topicCount, unit: "条", hint: "生成可跟的选题方向" },
    { href: "/scripts", label: "脚本", count: scriptCount, unit: "份", hint: "标题、开头与脚本框架" },
    { href: "/posts", label: "数据", count: postCount, unit: "条", hint: "录入作品表现数据" },
    { href: "/reviews", label: "复盘", count: reviewCount, unit: "份", hint: "为什么好 / 不好、下一步做什么" },
  ];

  const completedSteps = steps.filter((item) => item.count > 0).length;
  const nextStep = steps.find((item) => item.count === 0);

  return (
    <div className="space-y-6">
      <PageHeader title="概览" description="今天该发什么、发完表现如何，都汇总在这里。" />

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

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <Link key={step.href} href={step.href} className="rounded-lg border p-4 hover:bg-accent">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{step.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {step.count} {step.unit}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{step.hint}</p>
          </Link>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>本月用量与闭环进度</CardTitle>
          <CardDescription>额度每月重置；日额度用于防刷，所有 AI 功能共用。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 space-y-1 rounded-md border p-3">
            <p className="text-sm font-medium">
              闭环进度：已完成 {completedSteps} / {steps.length} 步
            </p>
            <p className="text-xs text-muted-foreground">
              {nextStep
                ? "下一步：" + nextStep.label + " —— " + nextStep.hint
                : "四步已全部走通，保持「选题 -> 脚本 -> 数据 -> 复盘」的节奏。"}
            </p>
          </div>
          <QuotaMeter usage={usage} />
        </CardContent>
      </Card>
    </div>
  );
}