import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PlaceholderPanel } from "@/components/placeholder-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "设置" };

const ENV_KEYS = [
  { key: "DATABASE_URL", note: "开发用 SQLite 文件路径，生产换 Postgres 连接串" },
  { key: "SESSION_SECRET", note: "会话签名密钥，至少 32 位" },
  { key: "OPENAI_API_KEY", note: "仅服务端使用，绝不暴露给浏览器" },
  { key: "OPENAI_BASE_URL", note: "OpenAI 兼容接口地址" },
  { key: "OPENAI_MODEL", note: "模型名" },
  { key: "AI_DAILY_LIMIT", note: "单用户每日调用上限（默认 20）" },
  { key: "QUOTA_TOPIC", note: "每月选题额度（默认 10）" },
  { key: "QUOTA_SCRIPT", note: "每月脚本额度（默认 10）" },
  { key: "QUOTA_REVIEW", note: "每月复盘额度（默认 5）" },
  { key: "APP_BASE_URL", note: "应用外部访问地址" },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="设置" description="账号、画像与用量管理。" />

      <PlaceholderPanel
        stage="P1"
        title="账号与画像"
        description="P0 阶段为占位路由；P1 将接入登录态、账号画像编辑与用量展示。"
        items={["账号邮箱与密码修改", "账号画像编辑（平台、赛道、人设、粉丝量）", "导出数据与注销账号"]}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>环境变量清单</CardTitle>
            <Badge variant="outline">只读说明</Badge>
          </div>
          <CardDescription>
            本页只列出变量名与用途，不读取也不展示任何实际值。实际值请查看本地 .env 或部署平台配置。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y text-sm">
            {ENV_KEYS.map((item) => (
              <div key={item.key} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-4">
                <dt className="font-mono text-xs sm:w-56 sm:shrink-0">{item.key}</dt>
                <dd className="text-muted-foreground">{item.note}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}