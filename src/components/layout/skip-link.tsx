/**
 * 跳转到主内容（无障碍基线）：键盘与读屏用户可跳过侧边栏/顶栏导航直接到正文。
 * 平时视觉隐藏，获得焦点时显示在左上角。
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
    >
      跳到主要内容
    </a>
  );
}
