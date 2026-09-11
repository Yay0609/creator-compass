import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "@/components/profile/profile-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "账号画像" };

export default async function OnboardingPage() {
  const user = await requireUser();

  const existing = await prisma.creatorProfile.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });

  if (existing) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="创建账号画像"
        description="这些信息会直接决定选题方向与文案口吻，尽量填得具体一些。"
      />
      <Card>
        <CardContent className="pt-6">
          <ProfileForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}