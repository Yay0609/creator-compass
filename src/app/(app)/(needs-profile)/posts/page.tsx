import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PostsWorkspace } from "@/components/posts/posts-workspace";
import { requireProfile } from "@/lib/auth/session";
import { POST_PAGE_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toPostDto } from "@/lib/dto";
import { encodePostCursor } from "@/lib/posts/schemas";
import { scriptTitleOf } from "@/lib/posts/service";
import { readUsage, toReviewUsage } from "@/lib/quota/usage";

export const metadata: Metadata = { title: "作品数据" };

export const dynamic = "force-dynamic";

const SCRIPT_SELECT = { select: { titles: true } } as const;

export default async function PostsPage() {
  const user = await requireProfile();

  // 多取一条用于判断是否还有下一页
  const rows = await prisma.postRecord.findMany({
    where: { userId: user.id },
    include: { script: SCRIPT_SELECT },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
  });

  const hasMore = rows.length > POST_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, POST_PAGE_SIZE) : rows;
  const last = page[page.length - 1];
  const usage = toReviewUsage(await readUsage(user.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="作品数据"
        description="手动录入或粘贴 CSV，积累你自己的数据基线；数据只来自你手动提供，不做任何平台抓取。"
      />
      <PostsWorkspace
        initialPosts={page.map((row) => toPostDto(row, scriptTitleOf(row.script)))}
        initialCursor={hasMore && last ? encodePostCursor(last.createdAt, last.id) : null}
        initialUsage={usage}
      />
    </div>
  );
}