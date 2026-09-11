import { describe, expect, it } from "vitest";

import {
  deleteAccountSchema,
  loginSchema,
  profileFormSchema,
  profileSchema,
  registerSchema,
} from "@/lib/auth/schemas";

describe("邮箱规范化", () => {
  it("去除首尾空格并统一小写", () => {
    const result = registerSchema.parse({ email: "  Alice@Example.COM ", password: "Passw0rd!" });
    expect(result.email).toBe("alice@example.com");
  });

  it("拒绝非法邮箱", () => {
    expect(registerSchema.safeParse({ email: "not-an-email", password: "Passw0rd!" }).success).toBe(false);
  });

  it("昵称可省略", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "Passw0rd!" }).success).toBe(true);
  });
});

describe("密码规则", () => {
  const base = { email: "a@b.com" };

  it("少于 8 位被拒绝", () => {
    expect(registerSchema.safeParse({ ...base, password: "Ab1" }).success).toBe(false);
  });

  it("缺少数字被拒绝", () => {
    expect(registerSchema.safeParse({ ...base, password: "Passworddd" }).success).toBe(false);
  });

  it("缺少字母被拒绝", () => {
    expect(registerSchema.safeParse({ ...base, password: "12345678" }).success).toBe(false);
  });

  it("超过 72 位被拒绝", () => {
    expect(registerSchema.safeParse({ ...base, password: `A1${"x".repeat(71)}` }).success).toBe(false);
  });

  it("字母 + 数字且长度达标才通过", () => {
    expect(registerSchema.safeParse({ ...base, password: "Passw0rd!" }).success).toBe(true);
  });

  it("登录只校验非空，不复用强度规则", () => {
    expect(loginSchema.safeParse({ ...base, password: "short" }).success).toBe(true);
  });
});

const VALID_PROFILE = {
  name: "小王的穿搭日记",
  platform: "xiaohongshu",
  niche: "穿搭",
  positioning: "帮通勤党用 300 元搭出一周不重样的穿搭",
  followerCount: "500",
  weeklyCapacity: "3",
  goal: "grow",
  targetAudience: "",
  tone: "",
  contentFormats: ["graphic"],
};

describe("账号画像 schema", () => {
  it("服务端 schema 会把数字型字符串转成 number", () => {
    const parsed = profileSchema.parse(VALID_PROFILE);

    expect(parsed.followerCount).toBe(500);
    expect(parsed.weeklyCapacity).toBe(3);
  });

  it("表单 schema 保留字符串，便于与 input 一一对应", () => {
    expect(profileFormSchema.parse(VALID_PROFILE).followerCount).toBe("500");
  });

  it("平台必须是允许值", () => {
    expect(profileSchema.safeParse({ ...VALID_PROFILE, platform: "weibo" }).success).toBe(false);
  });

  it("目标必须是允许值", () => {
    expect(profileSchema.safeParse({ ...VALID_PROFILE, goal: "unknown" }).success).toBe(false);
  });

  it("粉丝数必须是纯数字", () => {
    expect(profileFormSchema.safeParse({ ...VALID_PROFILE, followerCount: "五百" }).success).toBe(false);
    expect(profileFormSchema.safeParse({ ...VALID_PROFILE, followerCount: "-5" }).success).toBe(false);
  });

  it("人设定位不能为空白", () => {
    expect(profileFormSchema.safeParse({ ...VALID_PROFILE, positioning: "   " }).success).toBe(false);
  });

  it("语言风格允许留空，但不允许非法值", () => {
    expect(profileFormSchema.safeParse({ ...VALID_PROFILE, tone: "" }).success).toBe(true);
    expect(profileFormSchema.safeParse({ ...VALID_PROFILE, tone: "friendly" }).success).toBe(true);
    expect(profileFormSchema.safeParse({ ...VALID_PROFILE, tone: "angry" }).success).toBe(false);
  });

  it("内容形式必须是允许值", () => {
    expect(profileFormSchema.safeParse({ ...VALID_PROFILE, contentFormats: ["graphic", "vlog"] }).success).toBe(true);
    expect(profileFormSchema.safeParse({ ...VALID_PROFILE, contentFormats: ["unknown"] }).success).toBe(false);
  });
});

describe("注销 schema", () => {
  it("确认文案必须完全一致", () => {
    expect(deleteAccountSchema.safeParse({ password: "x", confirm: "注销" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "x", confirm: "注销账号" }).success).toBe(true);
  });

  it("密码不能为空", () => {
    expect(deleteAccountSchema.safeParse({ password: "", confirm: "注销账号" }).success).toBe(false);
  });
});