import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ReviewReport } from "@/components/reviews/review-report";
import { buttonVariants } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { toReviewDto } from "@/lib/dto";
import { formatShanghaiDateTime } from "@/lib/posts/display";

export const metadata: Metadata = { title: "复盘详情" };

export const dynamic = "force-dynamic";

export default async function ReviewDetailPage({ params }: { params: { id: string } }) {
  const user = await requireProfile();

  // 查询必须带 userId：他人的报告一律 404
  const review = await prisma.reviewReport.findFirst({
    where: { id: params.id, userId: user.id },
  });

  if (!review) {
    notFound();
  }

  const dto = toReviewDto(review);

  return (
    <div className="space-y-6">
      <PageHeader
        title="复盘报告"
        description="结论、归因、基线与下一步动作；报告基于生成时的快照，之后修改作品不会影响历史结论。"
        actions={
          <Link href="/reviews" className={buttonVariants({ variant: "outline" })}>
            返回复盘列表
          </Link>
        }
      />

      <ReviewReport review={dto} />

      <p className="text-xs text-muted-foreground">
        生成时间 {formatShanghaiDateTime(review.createdAt)}
        {review.editedAt ? ` · 最后编辑 ${formatShanghaiDateTime(review.editedAt)}` : ""}
        {review.promptVersion ? ` · prompt ${review.promptVersion}` : ""}
      </p>
    </div>
  );
}