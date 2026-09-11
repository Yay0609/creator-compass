import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PlaceholderPanel } from "@/components/placeholder-panel";

export const metadata: Metadata = { title: "复盘详情" };

export default function ReviewDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <PageHeader title="复盘报告" description="结论、归因、基线与下一步动作。" />
      <PlaceholderPanel
        stage="P4"
        title={`复盘 ${params.id}`}
        description="P0 阶段为占位动态路由，报告内容将在 P4 接入。"
      />
    </div>
  );
}