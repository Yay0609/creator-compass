import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PlaceholderPanel } from "@/components/placeholder-panel";

export const metadata: Metadata = { title: "概览" };

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="概览" description="今天该发什么、最近表现如何，都汇总在这里。" />
      <PlaceholderPanel
        stage="P1"
        title="账号与增长概览"
        description="P0 阶段只提供骨架页面，概览数据会随阶段推进逐步接入。"
        items={[
          "P1：账号画像完成度、剩余 AI 额度",
          "P2：今日推荐选题入口与「换一批」",
          "P4：最近作品表现与待复盘提醒",
        ]}
      />
    </div>
  );
}