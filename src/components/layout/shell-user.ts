/** AppShell 需要的用户信息（不含任何敏感字段）。 */
export type ShellUser = {
  email: string;
  nickname: string | null;
};