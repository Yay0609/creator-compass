"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type FieldError as RhfFieldError } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { profileFormSchema, type ProfileFormValues } from "@/lib/auth/schemas";
import { apiRequest } from "@/lib/client/api";
import { CONTENT_FORMATS, GOALS, NICHES, PLATFORMS, TONES } from "@/lib/constants";

const CUSTOM_NICHE = "__custom__";

export function ProfileForm({
  mode,
  profileId,
  defaultValues,
}: {
  mode: "create" | "edit";
  profileId?: string;
  defaultValues?: Partial<ProfileFormValues>;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [useCustomNiche, setUseCustomNiche] = useState(() => {
    const initial = defaultValues?.niche ?? "";
    return initial !== "" && !(NICHES as readonly string[]).includes(initial);
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: "",
      platform: "",
      niche: "",
      positioning: "",
      followerCount: "",
      weeklyCapacity: "",
      goal: "",
      targetAudience: "",
      tone: "",
      contentFormats: [],
      ...defaultValues,
    },
  });

  const nicheValue = watch("niche") ?? "";
  const contentFormatsMessage = (errors.contentFormats as RhfFieldError | undefined)?.message;

  async function onSubmit(values: ProfileFormValues) {
    setFormError(null);
    setSaved(false);

    const payload = {
      ...values,
      contentFormats: Array.isArray(values.contentFormats) ? values.contentFormats : [],
    };

    const result =
      mode === "create"
        ? await apiRequest("/api/profiles", { method: "POST", body: JSON.stringify(payload) })
        : await apiRequest(`/api/profiles/${profileId ?? ""}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    if (mode === "create") {
      router.replace("/dashboard");
    } else {
      setSaved(true);
    }
    router.refresh();
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="账号名" htmlFor="name" error={errors.name?.message}>
          <Input id="name" placeholder="例如：小王的穿搭日记" {...register("name")} />
        </Field>

        <Field label="平台" htmlFor="platform" error={errors.platform?.message}>
          <Select id="platform" {...register("platform")}>
            <option value="">请选择平台</option>
            {PLATFORMS.map((platform) => (
              <option key={platform.value} value={platform.value}>
                {platform.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="赛道"
        htmlFor="niche"
        hint={useCustomNiche ? undefined : "选择最接近的一项，后续可以随时修改"}
        error={errors.niche?.message}
      >
        <Select
          id="niche"
          value={useCustomNiche ? CUSTOM_NICHE : nicheValue}
          onChange={(event) => {
            const value = event.target.value;
            if (value === CUSTOM_NICHE) {
              setUseCustomNiche(true);
              setValue("niche", "", { shouldValidate: false });
            } else {
              setUseCustomNiche(false);
              setValue("niche", value, { shouldValidate: true });
            }
          }}
        >
          <option value="">请选择赛道</option>
          {NICHES.map((niche) => (
            <option key={niche} value={niche}>
              {niche}
            </option>
          ))}
          <option value={CUSTOM_NICHE}>其他（手动填写）</option>
        </Select>
        {useCustomNiche ? (
          <Input id="niche-custom" className="mt-2" placeholder="请输入你的赛道，例如：露营装备" {...register("niche")} />
        ) : null}
      </Field>

      <Field
        label="人设定位"
        htmlFor="positioning"
        hint="一句话说清你是谁、给谁看、提供什么价值"
        error={errors.positioning?.message}
      >
        <Textarea
          id="positioning"
          placeholder="例如：帮通勤党用 300 元搭出一周不重样的穿搭"
          {...register("positioning")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="当前粉丝量" htmlFor="followerCount" error={errors.followerCount?.message}>
          <Input id="followerCount" inputMode="numeric" placeholder="例如：500" {...register("followerCount")} />
        </Field>

        <Field
          label="每周可更新条数"
          htmlFor="weeklyCapacity"
          error={errors.weeklyCapacity?.message}
        >
          <Input id="weeklyCapacity" inputMode="numeric" placeholder="例如：3" {...register("weeklyCapacity")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="做号目标" htmlFor="goal" error={errors.goal?.message}>
          <Select id="goal" {...register("goal")}>
            <option value="">请选择目标</option>
            {GOALS.map((goal) => (
              <option key={goal.value} value={goal.value}>
                {goal.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="语言风格（选填）" htmlFor="tone" error={errors.tone?.message}>
          <Select id="tone" {...register("tone")}>
            <option value="">暂不指定</option>
            {TONES.map((tone) => (
              <option key={tone.value} value={tone.value}>
                {tone.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="目标人群（选填）"
        htmlFor="targetAudience"
        hint="例如：刚毕业的女生、预算有限的租房党"
        error={errors.targetAudience?.message}
      >
        <Input id="targetAudience" placeholder="你想影响谁" {...register("targetAudience")} />
      </Field>

      <div className="space-y-2">
        <Label>内容形式（选填，可多选）</Label>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {CONTENT_FORMATS.map((format) => (
            <label key={format.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                value={format.value}
                className="h-4 w-4 rounded border-input accent-foreground"
                {...register("contentFormats")}
              />
              <span>{format.label}</span>
            </label>
          ))}
        </div>
        <FieldError message={contentFormatsMessage} />
      </div>

      {formError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>
      ) : null}

      {saved ? (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">已保存</p>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "保存中…" : mode === "create" ? "保存并继续" : "保存修改"}
      </Button>
    </form>
  );
}