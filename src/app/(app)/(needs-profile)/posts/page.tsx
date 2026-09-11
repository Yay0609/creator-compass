import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PlaceholderPanel } from "@/components/placeholder-panel";

export const metadata: Metadata = { title: "作品数据" };

export default function PostsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="作品数据" description="手动录入或粘贴 CSV，积累你自己的数据基线。" />
      <PlaceholderPanel
        stage="P4"
        title="作品数据录入"
        description="P0 阶段为占位路由；P4 将接入手动录入、CSV 解析与列映射预览。"
        items={[
          "单条录入：标题、发布时间、曝光、播放、点赞、收藏、涨粉等",
          "CSV 粘贴：自动识别中文表头，支持手动映射列",
          "导入前预览，错误行逐条给出原因",
          "数据只来自你手动提供，不做任何平台抓取",
        ]}
      />
    </div>
  );
}