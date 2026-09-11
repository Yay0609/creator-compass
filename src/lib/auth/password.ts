import "server-only";

import bcrypt from "bcryptjs";

/** bcrypt 成本因子。纯 JS 实现下约 100ms/次，后续若并发升高可换原生实现。 */
export const BCRYPT_COST = 10;

export function hashPassword(plain: string, rounds: number = BCRYPT_COST): Promise<string> {
  return bcrypt.hash(plain, rounds);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}