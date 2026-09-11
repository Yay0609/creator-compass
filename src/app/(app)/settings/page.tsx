import type { Metadata } from "next";
import Link from "next/link";

import { DangerZone } from "@/components/account/danger-zone";
import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "@/components/profile/profile-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProfileFormValues } from "@/lib/auth/schemas";
import { requireUser } from "@/lib/auth/session";
import { GOALS, PLATFORMS, optionLabel } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toProfileDto } from "@/lib/dto";

export const metadata: Metadata = { title: "设置" };

export default async function SettingsPage() {
  const user = await requireUser();

  const profile = await prisma.creatorProfile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  const dto = profile ? toProfileDto(profile) : null;

  const defaultValues: ProfileFormValues | undefined = dto
    ? {
        name: dto.name,
        platform: dto.platform,
        niche: dto.niche,
        positioning: dto.positioning ?? "",
        followerCount: dto.followerCount === null ? "" : String(dto.followerCount),
        weeklyCapacity: dto.weeklyCapacity === null ? "" : String(dto.weeklyCapacity),
        goal: dto.goal ?? "",
        targetAudience: dto.targetAudience ?? "",
        tone: dto.tone ?? "",
        contentFormats: dto.contentFormats,
      }
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="设置" description="账号、账号画像与数据管理。" />

      <Card>
        <CardHeader>
          <CardTitle>账号信息</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">昵称</dt>
              <dd>{user.nickname ?? "未设置"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">修改昵称 / 修改密码</dt>
              <dd className="text-muted-foreground">P5 提供</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>账号画像</CardTitle>
          <CardDescription>
            {dto
              ? `当前：${optionLabel(PLATFORMS, dto.platform)} · ${dto.niche} · 目标 ${optionLabel(GOALS, dto.goal)}`
              : "还没有账号画像，创建后才能使用选题与脚本功能。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {dto ? (
            <ProfileForm mode="edit" profileId={dto.id} defaultValues={defaultValues} />
          ) : (
            <Link href="/onboarding" className={buttonVariants()}>
              创建账号画像
            </Link>
          )}
        </CardContent>
      </Card>

      <DangerZone email={user.email} />
    </div>
  );
}