import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

const FEATURES = [
  {
    title: "热点选题推荐",
    stage: "已上线",
    description: "根据平台、赛道与账号画像，一次生成 5 条可跟选题，附推荐理由与参考方向。",
  },
  {
    title: "AI 标题与脚本",
    stage: "已上线",
    description: "由选题生成标题候选、开头钩子、分段脚本框架与标签，直接照着拍。",
  },
  {
    title: "作品数据复盘",
    stage: "P4",
    description: "手动录入或粘贴 CSV 作品数据，AI 回答哪条好、为什么、下一步怎么做。",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-16">
      <section className="space-y-4">
        <Badge variant="secondary">P3 已上线 · 选题与脚本可用</Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{APP_NAME}</h1>
        <p className="max-w-2xl text-muted-foreground">{APP_DESCRIPTION}</p>
        <p className="text-sm text-muted-foreground">
          今天发什么 → 怎么发 → 发完为什么行 / 不行，一条链路走完。
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/dashboard" className={buttonVariants()}>
            进入应用
          </Link>
          <Link href="/register" className={buttonVariants({ variant: "outline" })}>
            注册
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{feature.title}</CardTitle>
                <Badge variant="outline">{feature.stage}</Badge>
              </div>
              <CardDescription>{feature.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </div>
  );
}