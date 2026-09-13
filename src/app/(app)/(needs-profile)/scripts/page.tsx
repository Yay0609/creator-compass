import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { QuotaMeter } from "@/components/quota/quota-meter";
import { ScriptHistory } from "@/components/scripts/script-history";
import { buttonVariants } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { SCRIPT_PAGE_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { toScriptDto } from "@/lib/dto";
import { readUsage } from "@/lib/quota/usage";
import { encodeScriptCursor } from "@/lib/scripts/schemas";

export const metadata: Metadata = { title: "标题与脚本" };

export default async function ScriptsPage() {
  const user = await requireProfile();

  const [usage, rows] = await Promise.all([
    readUsage(user.id),
    prisma.script.findMany({
      where: { userId: user.id, isDiscarded: false },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: SCRIPT_PAGE_SIZE + 1,
    }),
  ]);

  const hasMore = rows.length > SCRIPT_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, SCRIPT_PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  return (
    <div className="space-y-6">
      <PageHeader
        title="标题与脚本"
        description="由选题生成标题候选、开头钩子、分段口播稿、标签与封面文案；可编辑、可复制。"
        actions={
          <Link href="/scripts/new" className={buttonVariants()}>
            新建脚本
          </Link>
        }
      />

      <QuotaMeter usage={usage} />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">历史脚本</h2>
        <ScriptHistory
          initialScripts={page.map(toScriptDto)}
          initialCursor={hasMore && last ? encodeScriptCursor(last.createdAt, last.id) : null}
        />
      </section>
    </div>
  );
}