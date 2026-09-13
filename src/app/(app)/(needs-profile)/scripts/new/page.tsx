import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ScriptGenerator } from "@/components/scripts/script-generator";
import { ScriptHistory } from "@/components/scripts/script-history";
import { buttonVariants } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { SCRIPT_PAGE_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toScriptDto } from "@/lib/dto";
import { readUsage, toScriptUsage } from "@/lib/quota/usage";
import { encodeScriptCursor } from "@/lib/scripts/schemas";

export const metadata: Metadata = { title: "生成脚本" };

/**
 * 生成页。
 * - 带 ?topicId=xxx 进入：校验选题归属后「进入即自动开始生成」
 * - 不带参数：手填主题后手动生成
 */
export default async function NewScriptPage({
  searchParams,
}: {
  searchParams: { topicId?: string };
}) {
  const user = await requireProfile();
  const topicId = typeof searchParams.topicId === "string" ? searchParams.topicId : null;

  const [usage, topic] = await Promise.all([
    readUsage(user.id),
    topicId
      ? // 查询必须带 userId：他人的选题一律 404
        prisma.topicIdea.findFirst({ where: { id: topicId, userId: user.id } })
      : Promise.resolve(null),
  ]);

  if (topicId && !topic) {
    notFound();
  }

  const rows = topic
    ? await prisma.script.findMany({
        where: { userId: user.id, topicId: topic.id, isDiscarded: false },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: SCRIPT_PAGE_SIZE + 1,
      })
    : [];

  const hasMore = rows.length > SCRIPT_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, SCRIPT_PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  return (
    <div className="space-y-6">
      <PageHeader
        title="生成脚本"
        description={
          topic
            ? "已带上选好的选题，进入后自动开始生成；也可以改补充说明或时长后重新生成。"
            : "输入一个主题即可生成完整脚本；也可以先去「选题」页挑一条现成的。"
        }
        actions={
          <Link href="/scripts" className={buttonVariants({ variant: "outline" })}>
            返回脚本列表
          </Link>
        }
      />

      <ScriptGenerator
        topicId={topic?.id ?? null}
        topicTitle={topic?.title ?? null}
        initialUsage={toScriptUsage(usage)}
        autoStart={topic !== null}
      />

      {topic ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">该选题的历史脚本</h2>
          <ScriptHistory
            initialScripts={page.map(toScriptDto)}
            initialCursor={hasMore && last ? encodeScriptCursor(last.createdAt, last.id) : null}
            topicId={topic.id}
            emptyText="这个选题还没有历史脚本。"
          />
        </section>
      ) : null}
    </div>
  );
}