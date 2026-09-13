import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { QuotaMeter } from "@/components/quota/quota-meter";
import { TopicGenerator } from "@/components/topics/topic-generator";
import { TopicHistory } from "@/components/topics/topic-history";
import { requireProfile } from "@/lib/auth/session";
import { TOPIC_EXCLUDE_TITLES_MAX, TOPIC_PAGE_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toTopicDto } from "@/lib/dto";
import { readUsage, toTopicUsage } from "@/lib/quota/usage";
import { encodeTopicCursor } from "@/lib/topics/schemas";

export const metadata: Metadata = { title: "选题推荐" };

export default async function TopicsPage() {
  const user = await requireProfile();

  const [usage, recent, rows] = await Promise.all([
    readUsage(user.id),
    prisma.topicIdea.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: TOPIC_EXCLUDE_TITLES_MAX,
      select: { title: true },
    }),
    prisma.topicIdea.findMany({
      where: { userId: user.id, isDiscarded: false },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: TOPIC_PAGE_SIZE + 1,
    }),
  ]);

  const hasMore = rows.length > TOPIC_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, TOPIC_PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  return (
    <div className="space-y-6">
      <PageHeader
        title="选题推荐"
        description="一次生成 5 条可跟选题，含推荐理由与参考方向；收藏后可在「脚本」阶段直接使用。"
      />

      <QuotaMeter usage={usage} />

      <TopicGenerator
        recentTitles={recent.map((item) => item.title)}
        initialUsage={toTopicUsage(usage)}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">历史选题</h2>
        <TopicHistory
          initialTopics={page.map(toTopicDto)}
          initialCursor={hasMore && last ? encodeTopicCursor(last.createdAt, last.id) : null}
        />
      </section>
    </div>
  );
}
