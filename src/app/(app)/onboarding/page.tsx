import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PlaceholderPanel } from "@/components/placeholder-panel";

export const metadata: Metadata = { title: "账号画像" };

export default function OnboardingPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="创建账号画像" description="告诉我们你在做什么账号，推荐才会贴合你的赛道。" />
      <PlaceholderPanel
        stage="P1"
        title="账号画像表单"
        description="P0 阶段为占位路由；P1 将接入 CreatorProfile 模型与表单校验。"
        items={[
          "平台：小红书 / B站 / 抖音",
          "赛道与人设定位、目标人群",
          "当前粉丝量级、每周可产出条数",
          "内容形式与语言风格偏好",
        ]}
      />
    </div>
  );
}