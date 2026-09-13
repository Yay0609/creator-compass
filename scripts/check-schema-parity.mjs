#!/usr/bin/env node
/**
 * 双 schema 一致性校验（P6）。
 *
 * 本地开发用 prisma/schema.prisma（SQLite），生产用 prisma/postgres/schema.prisma（Postgres）。
 * 两份文件的「模型部分」必须逐字一致，只允许 datasource 不同 —— 否则会出现
 * 「本地跑得通、生产表结构不对」这类最难排查的问题。
 *
 * 用法：node scripts/check-schema-parity.mjs    （或 corepack pnpm schema:check）
 * 退出码：0 = 一致；1 = 不一致或文件缺失。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SQLITE_SCHEMA_PATH = path.join("prisma", "schema.prisma");
const POSTGRES_SCHEMA_PATH = path.join("prisma", "postgres", "schema.prisma");

/** 归一化：去掉注释、空行与 datasource / generator 块，只留模型定义。 */
export function normalizeSchema(text) {
  const kept = [];
  let skippingBlock = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (skippingBlock) {
      if (trimmed.endsWith("}")) {
        skippingBlock = false;
      }
      continue;
    }

    if (trimmed.startsWith("datasource ") || trimmed.startsWith("generator ")) {
      if (!trimmed.includes("}")) {
        skippingBlock = true;
      }
      continue;
    }

    if (trimmed.length === 0 || trimmed.startsWith("//")) {
      continue;
    }

    kept.push(line.trimEnd());
  }

  return kept.join("\n");
}

/** 找出第一处不同（1 起的行号），用于把差异指到具体行。 */
export function firstDifference(left, right) {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const total = Math.max(leftLines.length, rightLines.length);

  for (let index = 0; index < total; index += 1) {
    const leftLine = leftLines[index];
    const rightLine = rightLines[index];
    if (leftLine !== rightLine) {
      return {
        line: index + 1,
        sqlite: leftLine ?? "(缺失)",
        postgres: rightLine ?? "(缺失)",
      };
    }
  }

  return null;
}

/** 比较两份 schema 文本，返回是否一致与第一处差异。 */
export function compareSchemas(sqliteText, postgresText) {
  const sqlite = normalizeSchema(sqliteText);
  const postgres = normalizeSchema(postgresText);

  if (sqlite === postgres) {
    return { same: true, sqlite, postgres, difference: null };
  }

  return { same: false, sqlite, postgres, difference: firstDifference(sqlite, postgres) };
}

function main() {
  let sqliteText;
  let postgresText;

  try {
    sqliteText = readFileSync(path.join(process.cwd(), SQLITE_SCHEMA_PATH), "utf8");
    postgresText = readFileSync(path.join(process.cwd(), POSTGRES_SCHEMA_PATH), "utf8");
  } catch (error) {
    console.error("读取 schema 失败：" + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
    return;
  }

  const result = compareSchemas(sqliteText, postgresText);

  if (result.same) {
    console.log(
      "双 schema 一致：" +
        SQLITE_SCHEMA_PATH +
        " ≡ " +
        POSTGRES_SCHEMA_PATH +
        "（模型 " +
        result.sqlite.split("\n").length +
        " 行，仅 datasource 不同）",
    );
    return;
  }

  console.error("双 schema 不一致：模型部分必须逐字一致，只允许 datasource 不同。");
  if (result.difference) {
    console.error("第一处差异（归一化后第 " + result.difference.line + " 行）：");
    console.error("  " + SQLITE_SCHEMA_PATH + " -> " + result.difference.sqlite);
    console.error("  " + POSTGRES_SCHEMA_PATH + " -> " + result.difference.postgres);
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}