import {
  BarChart3,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Lightbulb,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  showInMobileTab: boolean;
};

/** 导航唯一真源：新增页面时改这里即可，侧边栏与移动底栏自动同步。 */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "概览",
    description: "今日建议与最近作品",
    icon: LayoutDashboard,
    showInMobileTab: true,
  },
  {
    href: "/topics",
    label: "选题",
    description: "生成可跟的选题方向",
    icon: Lightbulb,
    showInMobileTab: true,
  },
  {
    href: "/scripts",
    label: "脚本",
    description: "标题、开头与脚本框架",
    icon: FileText,
    showInMobileTab: true,
  },
  {
    href: "/posts",
    label: "数据",
    description: "录入与查看作品数据",
    icon: BarChart3,
    showInMobileTab: true,
  },
  {
    href: "/reviews",
    label: "复盘",
    description: "复盘报告与下一步建议",
    icon: ClipboardCheck,
    showInMobileTab: false,
  },
  {
    href: "/settings",
    label: "设置",
    description: "账号画像与用量",
    icon: Settings,
    showInMobileTab: false,
  },
];

export const MOBILE_TAB_ITEMS = NAV_ITEMS.filter((item) => item.showInMobileTab);

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}