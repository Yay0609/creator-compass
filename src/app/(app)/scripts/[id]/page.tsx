import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PlaceholderPanel } from "@/components/placeholder-panel";

export const metadata: Metadata = { title: "脚本详情" };

export default function ScriptDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <PageHeader title="脚本详情" description="查看与编辑标题、开头、分段脚本和标签。" />
      <PlaceholderPanel
        stage="P3"
        title={`脚本 ${params.id}`}
        description="P0 阶段为占位动态路由，脚本内容将在 P3 接入。"
      />
    </div>
  );
}