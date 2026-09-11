import { z } from "zod";

import { CONTENT_FORMATS, GOALS, PLATFORMS, TONES, optionValues } from "@/lib/constants";

const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
/** bcrypt 只使用前 72 字节，超过部分会被静默截断，因此显式拒绝 */
const PASSWORD_MAX = 72;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "请输入邮箱")
  .max(EMAIL_MAX, "邮箱过长")
  .email("请输入有效的邮箱地址");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `密码至少 ${PASSWORD_MIN} 位`)
  .max(PASSWORD_MAX, `密码最长 ${PASSWORD_MAX} 位`)
  .regex(/[A-Za-z]/, "密码需包含字母")
  .regex(/\d/, "密码需包含数字");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  nickname: z.string().trim().max(24, "昵称最多 24 字").optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** 登录不做强度校验：只要非空即可，避免历史密码规则变更后无法登录 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "请输入密码").max(PASSWORD_MAX, "密码过长"),
});

export type LoginInput = z.infer<typeof loginSchema>;

function requiredText(label: string, max: number) {
  return z.string().trim().min(1, `请填写${label}`).max(max, `${label}最多 ${max} 字`);
}

function optionalText(max: number) {
  return z.string().trim().max(max, `最多 ${max} 字`);
}

function digitsText(label: string) {
  return z.string().trim().regex(/^\d+$/, `${label}请填写数字，例如 500`);
}

function oneOfValues(values: readonly string[], message: string) {
  return z.string().trim().refine((value) => values.includes(value), message);
}

function oneOfValuesOrEmpty(values: readonly string[], message: string) {
  return z.string().trim().refine((value) => value === "" || values.includes(value), message);
}

/**
 * 表单侧 schema：所有字段都是字符串，与 <input> 的原生值一一对应，
 * 便于 react-hook-form 的默认值与类型推导。
 */
export const profileFormSchema = z.object({
  name: requiredText("账号名", 40),
  platform: oneOfValues(optionValues(PLATFORMS), "请选择平台"),
  niche: requiredText("赛道", 20),
  positioning: requiredText("人设定位", 100),
  followerCount: digitsText("粉丝数量"),
  weeklyCapacity: digitsText("每周更新条数"),
  goal: oneOfValues(optionValues(GOALS), "请选择目标"),
  targetAudience: optionalText(100),
  tone: oneOfValuesOrEmpty(optionValues(TONES), "请选择语言风格"),
  contentFormats: z
    .array(oneOfValues(optionValues(CONTENT_FORMATS), "内容形式不合法"))
    .max(6, "最多选择 6 项"),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

/** 服务端 schema：在同名字段上把数字型字符串转成 number。 */
export const profileSchema = profileFormSchema.extend({
  followerCount: z.coerce.number().int("请填写整数").min(0, "不能为负数").max(1000000, "数值过大"),
  weeklyCapacity: z.coerce.number().int("请填写整数").min(0, "不能为负数").max(50, "每周最多 50 条"),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const DELETE_ACCOUNT_CONFIRM_TEXT = "注销账号";

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "请输入当前密码"),
  confirm: z
    .string()
    .refine((value) => value === DELETE_ACCOUNT_CONFIRM_TEXT, `请输入「${DELETE_ACCOUNT_CONFIRM_TEXT}」以确认`),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;