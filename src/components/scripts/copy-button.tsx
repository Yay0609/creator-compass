"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/client/clipboard";

/** 复制按钮：成功后 1.6s 内显示「已复制」，不弹 toast（保持依赖最小）。 */
export function CopyButton({
  value,
  label = "复制",
  variant = "outline",
  size = "sm",
  className,
}: {
  value: string;
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    const success = await copyText(value);
    if (!success) {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={value.trim().length === 0}
      onClick={() => void handleCopy()}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "已复制" : label}
    </Button>
  );
}