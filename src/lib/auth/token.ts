import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import { SESSION_TTL_MS } from "./session-constants";

/** 生成 32 字节随机 token（base64url），明文只进 Cookie。 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * 会话主键：HMAC-SHA256(token, SESSION_SECRET)。
 * 用 HMAC 而不是裸 sha256，使数据库泄露者无法在没有 SESSION_SECRET 时伪造会话。
 */
export function deriveSessionId(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function sessionExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}