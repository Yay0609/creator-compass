import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PlaceholderPanel } from "@/components/placeholder-panel";

export const metadata: Metadata = { title: "数据复盘" };

export default function ReviewsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="数据复盘" description="AI 告诉你哪条好、为什么、下一步怎么做。" />
      <PlaceholderPanel
        stage="P4"
        title="复盘报告"
        description="P0 阶段为占位路由；P4 将接入单篇与批量复盘生成。"
        items={[
          "结论：表现最好与最差的作品",
          "归因：选题、标题、开头、发布节奏逐项分析",
          "基线：与账号自身历史表现对比",
          "下一步：3–5 条可执行动作 + 下一批选题建议",
        ]}
      />
    </div>
  );
}