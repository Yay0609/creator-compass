// 本文件会被 edge runtime 的 middleware 引用，禁止引入任何 Node 专有依赖（node:crypto、Prisma 等）。

/** 会话 Cookie 名。middleware 与 Node 侧共用，避免两处写死不一致。 */
export const SESSION_COOKIE_NAME = "cc_session";

/** 会话有效期：30 天（固定，不滑动续期） */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** lastSeenAt 写库节流间隔，避免每个请求都写一次数据库 */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export const SESSION_COOKIE_MAX_AGE_SEC = Math.floor(SESSION_TTL_MS / 1000);