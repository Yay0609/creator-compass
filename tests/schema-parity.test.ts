import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error - 校验脚本是 .mjs（无类型声明），这里只借用它的纯函数
import { compareSchemas, firstDifference, normalizeSchema } from "../scripts/check-schema-parity.mjs";

const DQ = String.fromCharCode(34);

const SQLITE_SCHEMA = "prisma/schema.prisma";
const POSTGRES_SCHEMA = "prisma/postgres/schema.prisma";

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function withDatasource(provider: string, url: string): string {
  return [
    "generator client {",
    "  provider = " + DQ + "prisma-client-js" + DQ,
    "}",
    "",
    "datasource db {",
    "  provider = " + DQ + provider + DQ,
    "  url      = env(" + DQ + url + DQ + ")",
    "}",
    "",
    "model Demo {",
    "  id String @id",
    "}",
  ].join("\n");
}

describe("normalizeSchema", () => {
  it("去掉注释、空行与 datasource / generator 块", () => {
    const text = [
      "// 文件头注释",
      "/// 模型文档注释",
      "generator client {",
      "  provider = " + DQ + "prisma-client-js" + DQ,
      "}",
      "",
      "datasource db {",
      "  provider = " + DQ + "sqlite" + DQ,
      "  url      = env(" + DQ + "DATABASE_URL" + DQ + ")",
      "}",
      "",
      "model Demo {",
      "  id String @id",
      "}",
    ].join("\n");

    expect(normalizeSchema(text)).toBe(["model Demo {", "  id String @id", "}"].join("\n"));
  });

  it("保留字段缩进，避免把格式差异当成等价", () => {
    const text = ["model Demo {", "id String @id", "}"].join("\n");
    expect(normalizeSchema(text)).toContain("id String @id");
  });
});

describe("compareSchemas", () => {
  it("只有 datasource 不同时视为一致", () => {
    const result = compareSchemas(
      withDatasource("sqlite", "DATABASE_URL"),
      withDatasource("postgresql", "DATABASE_URL"),
    );
    expect(result.same).toBe(true);
    expect(result.difference).toBeNull();
  });

  it("模型字段不同时能定位到第一处差异", () => {
    const left = withDatasource("sqlite", "DATABASE_URL");
    const right = withDatasource("postgresql", "DATABASE_URL").replace(
      "  id String @id",
      "  id Int @id",
    );
    const result = compareSchemas(left, right);

    expect(result.same).toBe(false);
    expect(result.difference).not.toBeNull();
    expect(result.difference?.sqlite).toBe("  id String @id");
    expect(result.difference?.postgres).toBe("  id Int @id");
  });
});

describe("firstDifference", () => {
  it("完全一致时返回 null", () => {
    expect(firstDifference("a\nb", "a\nb")).toBeNull();
  });

  it("行数不同时把缺失侧标成 (缺失)", () => {
    const difference = firstDifference("a\nb", "a");
    expect(difference?.line).toBe(2);
    expect(difference?.postgres).toBe("(缺失)");
  });
});

describe("仓库中的双 schema", () => {
  it("模型部分必须逐字一致（只允许 datasource 不同）", () => {
    const result = compareSchemas(read(SQLITE_SCHEMA), read(POSTGRES_SCHEMA));
    expect(result.difference).toBeNull();
    expect(result.same).toBe(true);
  });

  it("Postgres schema 使用 postgresql provider 与独立连接串", () => {
    const postgres = read(POSTGRES_SCHEMA);
    expect(postgres).toContain("provider  = " + DQ + "postgresql" + DQ);
    expect(postgres).toContain("directUrl = env(" + DQ + "DIRECT_URL" + DQ + ")");
  });
});