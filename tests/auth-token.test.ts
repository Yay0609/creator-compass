import { describe, expect, it } from "vitest";

import { SESSION_TTL_MS } from "@/lib/auth/session-constants";
import { deriveSessionId, generateSessionToken, isSessionExpired, sessionExpiryFrom } from "@/lib/auth/token";

describe("会话 token", () => {
  it("生成的 token 足够长、字符集合法且互不相同", () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("deriveSessionId 对同一输入稳定，输出 64 位 hex", () => {
    const id1 = deriveSessionId("fixed-token", "secret-a");
    const id2 = deriveSessionId("fixed-token", "secret-a");

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("更换 SESSION_SECRET 会得到不同会话 ID", () => {
    expect(deriveSessionId("t", "secret-a")).not.toBe(deriveSessionId("t", "secret-b"));
  });

  it("会话 ID 不等于明文 token（明文不落库）", () => {
    const token = generateSessionToken();
    expect(deriveSessionId(token, "secret")).not.toBe(token);
  });

  it("sessionExpiryFrom 使用 30 天有效期", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(sessionExpiryFrom(now).getTime() - now.getTime()).toBe(SESSION_TTL_MS);
  });

  it("isSessionExpired 在到期时刻即判定为过期", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(isSessionExpired(new Date(now.getTime() - 1), now)).toBe(true);
    expect(isSessionExpired(now, now)).toBe(true);
    expect(isSessionExpired(new Date(now.getTime() + 1), now)).toBe(false);
  });
});