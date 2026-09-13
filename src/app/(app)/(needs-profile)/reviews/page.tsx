import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ReviewGenerator } from "@/components/reviews/review-generator";
import { ReviewHistory } from "@/components/reviews/review-history";
import { requireProfile } from "@/lib/auth/session";
import { REVIEW_PAGE_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toPostDto, toReviewDto } from "@/lib/dto";
import { encodeReviewCursor } from "@/lib/reviews/schemas";
import { scriptTitleOf } from "@/lib/posts/service";
import { readUsage, toReviewUsage } from "@/lib/quota/usage";

export const metadata: Metadata = { title: "数据复盘" };

export const dynamic = "force-dynamic";

/** 复盘可选的最近作品数：覆盖 MVP 阶段的手动录入规模。 */
const RECENT_POST_LIMIT = 50;

export default async function ReviewsPage() {
  const user = await requireProfile();

  const [postRows, reviewRows, usage] = await Promise.all([
    prisma.postRecord.findMany({
      where: { userId: user.id },
      include: { script: { select: { titles: true } } },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: RECENT_POST_LIMIT,
    }),
    prisma.reviewReport.findMany({
      where: { userId: user.id, isDiscarded: false },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: REVIEW_PAGE_SIZE + 1,
    }),
    readUsage(user.id),
  ]);

  const hasMore = reviewRows.length > REVIEW_PAGE_SIZE;
  const page = hasMore ? reviewRows.slice(0, REVIEW_PAGE_SIZE) : reviewRows;
  const last = page[page.length - 1];

  return (
    <div className="space-y-6">
      <PageHeader
        title="数据复盘"
        description="选作品生成报告：结论摘要、分维度诊断、下一步建议与下一批选题。"
      />

      <ReviewGenerator
        posts={postRows.map((row) => toPostDto(row, scriptTitleOf(row.script)))}
        initialUsage={toReviewUsage(usage)}
        description="勾选要复盘的作品（1–50 条）。基线取自账号历史作品的均值与中位数，并排除本次纳入的作品。"
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">历史报告</h2>
        <ReviewHistory
          initialReviews={page.map(toReviewDto)}
          initialCursor={hasMore && last ? encodeReviewCursor(last.createdAt, last.id) : null}
        />
      </section>
    </div>
  );
}