/**
 * 本地脚本共用的 .env 读取工具（P5）。
 * 只服务于开发/运维脚本；应用运行时一律走 src/lib/env.ts 的 getEnv()。
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const DQUOTE = String.fromCharCode(34);
const SQUOTE = String.fromCharCode(39);

/** 读取项目根目录的 .env，写入 process.env（已存在的键优先，不覆盖）。 */
export function loadEnvFile() {
  const file = path.join(process.cwd(), ".env");
  let raw = "";

  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    if (index <= 0) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith(DQUOTE) && value.endsWith(DQUOTE)) ||
      (value.startsWith(SQUOTE) && value.endsWith(SQUOTE))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** 读取数字型环境变量；缺失或非法时回退到默认值。 */
export function envNumber(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
