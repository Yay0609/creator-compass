import { describe, expect, it } from "vitest";

import { BCRYPT_COST, hashPassword, verifyPassword } from "@/lib/auth/password";

// 测试固定使用低成本因子，避免拖慢用例；生产仍走 BCRYPT_COST
const TEST_ROUNDS = 4;

describe("密码哈希", () => {
  it("哈希结果不含明文，且带 bcrypt 前缀", async () => {
    const hash = await hashPassword("Passw0rd!", TEST_ROUNDS);

    expect(hash).not.toContain("Passw0rd!");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("同一密码两次哈希结果不同（加盐）", async () => {
    const [first, second] = await Promise.all([
      hashPassword("Passw0rd!", TEST_ROUNDS),
      hashPassword("Passw0rd!", TEST_ROUNDS),
    ]);

    expect(first).not.toBe(second);
  });

  it("verifyPassword 正确密码返回 true，错误密码返回 false", async () => {
    const hash = await hashPassword("Passw0rd!", TEST_ROUNDS);

    await expect(verifyPassword("Passw0rd!", hash)).resolves.toBe(true);
    await expect(verifyPassword("passw0rd!", hash)).resolves.toBe(false);
  });

  it("默认成本因子为 10", () => {
    expect(BCRYPT_COST).toBe(10);
  });
});