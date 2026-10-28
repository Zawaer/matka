import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";

type Tone = "neutral" | "primary" | "success" | "warn" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-secondary",
  primary: "bg-primary/12 text-primary",
  success: "bg-success/12 text-success",
  warn: "bg-warn/14 text-warn",
  danger: "bg-danger/12 text-danger",
};

/** A small status label: "Home", "Edited", "Online". */
export function Badge({
  tone = "neutral",
  icon: I,
  className,
  children,
  title,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-caption font-medium",
        TONE[tone],
        className,
      )}
    >
      {I && <I size={16} strokeWidth={1.75} aria-hidden />}
      {children}
    </span>
  );
}

/** A compact value pill with an optional leading mark: "● 412 km". */
export function Chip({ className, children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-2.5 text-meta text-secondary",
        className,
      )}
    >
      {children}
    </span>
  );
}
