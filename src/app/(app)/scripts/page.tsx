import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PlaceholderPanel } from "@/components/placeholder-panel";

export const metadata: Metadata = { title: "标题与脚本" };

export default function ScriptsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="标题与脚本" description="由选题生成标题候选、开头钩子、脚本框架与标签。" />
      <PlaceholderPanel
        stage="P3"
        title="AI 标题与脚本"
        description="P0 阶段为占位路由；P3 将接入脚本生成与编辑保存。"
        items={[
          "5 个标题候选 + 1 个开头钩子",
          "分段脚本框架与完整口播稿",
          "标签与封面文案建议",
          "支持手动编辑后保存",
        ]}
      />
    </div>
  );
}