"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx } from "./cx";

/** A labelled value in monospace with a Copy button: pairing links, tokens. */
export function CopyField({ label, value, className }: { label: string; value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  const I = copied ? Check : Copy;
  return (
    <div className={cx("min-w-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-medium uppercase tracking-wide text-muted">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="-mr-1.5 inline-flex h-7 items-center gap-1 rounded-control px-1.5 text-meta font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <I size={16} strokeWidth={1.75} aria-hidden />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <code className="mt-1 block select-all break-all rounded-control border border-border bg-surface-2 px-3 py-2 text-left font-mono text-meta text-text">
        {value}
      </code>
    </div>
  );
}
