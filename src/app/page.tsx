import Link from "next/link";

import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

const PAIN_POINTS = [
  "选题靠感觉：不知道明天该发什么，追热点又总是慢半拍。",
  "标题与开头不会写：内容不差，但点击率一直上不去。",
  "发完不会复盘：不知道这条为什么火，下一条还是靠猜。",
];

const LOOP_STEPS = [
  {
    step: "第 1 步",
    title: "找选题",
    description: "按平台、赛道与账号画像生成 5 条可跟选题，附推荐理由与参考方向。",
  },
  {
    step: "第 2 步",
    title: "写脚本",
    description: "由选题产出标题候选、开头钩子、分段脚本与标签，照着拍就行。",
  },
  {
    step: "第 3 步",
    title: "看数据",
    description: "录入或用 CSV 粘贴作品数据，AI 结合账号历史基线回答哪条好、为什么、下一步做什么。",
  },
];

const FEATURES = [
  {
    title: "热点选题推荐",
    description: "结合你的账号画像给方向，而不是把全网热搜丢给你。",
  },
  {
    title: "AI 标题与脚本",
    description: "标题、开头、分段脚本、标签与封面文案一次生成，可编辑可复制。",
  },
  {
    title: "作品数据复盘",
    description: "结论摘要、分维度诊断、下一步建议，还会顺手给下一批选题。",
  },
];

const FAQ = [
  {
    question: "需要绑定平台账号吗？",
    answer: "不需要。创作罗盘不抓取平台数据，也不收集你的平台账号密码或 Cookie；作品数据由你手动录入或粘贴 CSV。",
  },
  {
    question: "AI 生成的内容能直接用吗？",
    answer: "建议把它当成初稿：先改成人话再发。生成结果仅供参考，平台表现受多因素影响。",
  },
  {
    question: "免费额度有多少？",
    answer: "每月可生成 10 次选题、10 份脚本、5 份复盘，所有 AI 功能共用每日 20 次的防刷上限。",
  },
  {
    question: "我的数据能删掉吗？",
    answer: "可以。设置页支持导出全部数据，也支持一键注销；注销是物理删除，会话、选题、脚本、作品与日志会一并清除。",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-5xl space-y-5 px-6 py-16">
          <Badge variant="secondary">P5 已上线 · 选题 / 脚本 / 数据复盘全线可用</Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{APP_NAME}</h1>
          <p className="max-w-2xl text-muted-foreground">{APP_DESCRIPTION}</p>
          <p className="max-w-2xl text-sm text-muted-foreground">
            面向 0-1 万粉的新手创作者：今天发什么、怎么发、发完为什么行或不行，一条链路走完。
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              免费注册
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
              已有账号，去登录
            </Link>
          </div>
        </section>

        <section className="border-y bg-muted/40">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="text-xl font-semibold">新手最容易卡住的三件事</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-3">
              {PAIN_POINTS.map((point) => (
                <li key={point} className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-xl font-semibold">三步闭环</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {LOOP_STEPS.map((item) => (
              <Card key={item.title}>
                <CardHeader>
                  <p className="text-xs text-muted-foreground">{item.step}</p>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-y bg-muted/40">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="text-xl font-semibold">三个核心能力</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {FEATURES.map((feature) => (
                <Card key={feature.title}>
                  <CardHeader>
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-xl font-semibold">常见问题</h2>
          <dl className="mt-6 space-y-5">
            {FAQ.map((item) => (
              <div key={item.question} className="space-y-1">
                <dt className="text-sm font-medium">{item.question}</dt>
                <dd className="text-sm text-muted-foreground">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t bg-muted/40">
          <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-6 py-14">
            <h2 className="text-xl font-semibold">先跑通一条完整的创作链路</h2>
            <p className="text-sm text-muted-foreground">
              注册后先花一分钟填写账号画像，推荐才会有依据。不需要绑定任何平台账号。
            </p>
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              免费注册
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
