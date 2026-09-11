"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { registerSchema, type RegisterInput } from "@/lib/auth/schemas";
import { apiRequest } from "@/lib/client/api";

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", nickname: "" },
  });

  async function onSubmit(values: RegisterInput) {
    setFormError(null);

    const result = await apiRequest<{ user: { id: string } }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(values),
    });

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    // 注册即为登录态，直接进入账号画像引导
    router.replace("/onboarding");
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Field label="邮箱" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
      </Field>

      <Field
        label="密码"
        htmlFor="password"
        hint="至少 8 位，需同时包含字母与数字"
        error={errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="至少 8 位"
          {...register("password")}
        />
      </Field>

      <Field label="昵称（选填）" htmlFor="nickname" error={errors.nickname?.message}>
        <Input id="nickname" autoComplete="nickname" placeholder="怎么称呼你" {...register("nickname")} />
      </Field>

      {formError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "注册中…" : "注册"}
      </Button>
    </form>
  );
}