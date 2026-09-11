import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PlaceholderPanel } from "@/components/placeholder-panel";

export const metadata: Metadata = { title: "选题推荐" };

export default function TopicsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="选题推荐" description="一次生成 5 条可跟选题，附推荐理由与参考方向。" />
      <PlaceholderPanel
        stage="P2"
        title="热点选题推荐"
        description="P0 阶段为占位路由；P2 将接入选题生成、收藏与「换一批」。"
        items={[
          "每次生成 5 条选题，含推荐理由与参考方向",
          "展示预估热度、与账号画像的匹配度、制作难度",
          "支持收藏、标记已用、换一批",
          "生成失败可重试，消耗配额失败会回滚",
        ]}
      />
    </div>
  );
}