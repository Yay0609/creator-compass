import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PlaceholderPanel } from "@/components/placeholder-panel";

export const metadata: Metadata = { title: "选题详情" };

export default function TopicDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <PageHeader title="选题详情" description="查看选题理由与参考方向，并一键生成脚本。" />
      <PlaceholderPanel
        stage="P2"
        title={`选题 ${params.id}`}
        description="P0 阶段为占位动态路由，详情数据将在 P2 接入。"
      />
    </div>
  );
}