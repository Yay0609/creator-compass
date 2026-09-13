import type { Metadata } from "next";

import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "隐私政策" };

type Section = { title: string; paragraphs: string[]; items?: string[] };

const SECTIONS: Section[] = [
  {
    title: "1. 我们收集哪些信息",
    paragraphs: ["只收集提供功能所必需的信息："],
    items: [
      "账号信息：邮箱地址、密码哈希（bcrypt，不可逆）、昵称。",
      "账号画像：平台、赛道、人设、粉丝量、目标与更新频率等你主动填写的内容。",
      "你在使用过程中主动录入的内容：选题、脚本、作品数据（曝光、播放、点赞等）与复盘报告。",
      "AI 调用日志：模型名、状态、耗时、token 数与字符数等元数据。",
    ],
  },
  {
    title: "2. 我们不会收集什么",
    paragraphs: ["以下内容我们明确不收集、不抓取、不存储："],
    items: [
      "小红书 / B站 / 抖音 等平台的账号密码或登录 Cookie。",
      "通过爬虫或平台接口自动抓取的作品数据（作品数据只来自你手动录入或粘贴的 CSV）。",
      "你的通讯录、相册、地理位置等与功能无关的权限数据。",
    ],
  },
  {
    title: "3. AI 生成时的数据传输",
    paragraphs: [
      "使用 AI 选题、脚本、复盘功能时，系统会把完成该次生成所必需的上下文（账号画像、选题标题或作品数据摘要等）发送给本服务配置的模型服务商（OpenAI 兼容接口），用于生成结果。",
      "我们不会把邮箱、密码哈希或会话令牌发送给模型服务商；调用日志中也不会保存提示词原文与模型返回的完整内容。",
    ],
  },
  {
    title: "4. 日志与保留期",
    paragraphs: [
      "AI 调用日志仅保留元数据，用于排查故障与控制成本，保留期默认 90 天，超期后会被清理脚本删除。",
      "删除账号时，日志会随账号一并物理删除。",
    ],
  },
  {
    title: "5. Cookie 的使用",
    paragraphs: [
      "我们只使用一个登录会话 Cookie，用于识别你的登录状态；它是 httpOnly 的，不包含可用于直接登录的明文凭据，也不用于广告追踪。",
      "不使用第三方统计或广告类 Cookie。",
    ],
  },
  {
    title: "6. 你的权利",
    paragraphs: ["你可以随时在「设置」页："],
    items: [
      "导出数据：以 JSON 文件形式导出账号与全部业务数据（不含密码哈希）。",
      "注销账号：经密码与二次确认后物理删除账号，并级联删除会话、画像、选题、脚本、作品数据、复盘报告与调用日志。",
    ],
  },
  {
    title: "7. 联系方式与生效日期",
    paragraphs: [
      "运营主体、联系方式与生效日期：待补充。上线前会补齐真实信息并在此公示。",
      "如对本政策有疑问，可在补齐信息前先通过产品内反馈渠道联系开发者。",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold">隐私政策</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {APP_NAME} 说明我们收集什么、不收集什么，以及你可以怎样删除自己的数据。
        </p>
        <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
          待补充：运营主体名称、联系邮箱与生效日期，上线前补齐。
        </p>

        <div className="mt-8 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-base font-semibold">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {section.items ? (
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
