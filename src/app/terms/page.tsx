import type { Metadata } from "next";

import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "服务条款" };

type Section = { title: string; paragraphs: string[]; items?: string[] };

const SECTIONS: Section[] = [
  {
    title: "1. 服务内容",
    paragraphs: [
      "创作罗盘为内容创作者提供 AI 选题推荐、标题与脚本生成、作品数据复盘三项能力，均为辅助工具。",
      "本服务不提供平台账号代运营、不提供自动发布，也不承诺任何流量或涨粉结果。",
    ],
  },
  {
    title: "2. 账号与安全",
    paragraphs: [
      "你需要使用有效的邮箱注册，并对账号下的操作负责。请勿将账号交由他人使用。",
      "你可以随时在设置页修改账号信息或注销账号；注销后数据不可恢复。",
    ],
  },
  {
    title: "3. 使用规范",
    paragraphs: ["使用本服务时，你承诺不从事以下行为："],
    items: [
      "提交违法违规、侵权、虚假或误导性内容。",
      "利用本服务批量生成垃圾内容、进行流量作弊或规避平台规则。",
      "通过自动化手段高频调用接口，或试图绕过额度与防刷限制。",
      "对本服务进行逆向、扫描或干扰其正常运行。",
    ],
  },
  {
    title: "4. AI 生成内容",
    paragraphs: [
      "AI 生成结果由第三方模型产出，可能存在事实错误、表述不当或与你的品牌调性不符的情况；发布前请自行审核与修改。",
      "生成内容的使用与由此产生的后果由你自行承担。作品的流量表现受选题、发布时间、账号权重与平台规则等多因素影响，本服务不对效果作出任何保证。",
    ],
  },
  {
    title: "5. 额度与费用",
    paragraphs: [
      "当前为免费额度模式：每月可生成选题、脚本与复盘各若干次，全部 AI 功能共用每日调用上限。额度在每月 1 日重置。",
      "额度用尽或触发防刷上限时，功能会暂时不可用，待周期重置后自动恢复。",
    ],
  },
  {
    title: "6. 服务变更与终止",
    paragraphs: [
      "我们可能调整、暂停或终止部分功能，并在产品内以显著方式告知。",
      "若你违反本条款，我们有权限制或终止你对本服务的使用。",
    ],
  },
  {
    title: "7. 其他",
    paragraphs: [
      "运营主体、联系方式与生效日期：待补充。上线前会补齐真实信息并在此公示。",
      "本条款与隐私政策共同构成你与本服务之间的约定；隐私政策见「隐私政策」页面。",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold">服务条款</h1>
        <p className="mt-2 text-sm text-muted-foreground">使用 {APP_NAME} 前，请先了解这些约定。</p>
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
