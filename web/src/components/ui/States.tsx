import type { LucideIcon } from "lucide-react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cx } from "./cx";

/**
 * Nothing to show (yet): an icon, what's missing, and what to do about it,
 * centred in the space with no frame (a dashed box reads as a drop zone).
 */
export function EmptyState({
  icon: I,
  title,
  description,
  action,
  className,
  secondary,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Kept for callers; empty states never have a frame now. */
  bare?: boolean;
  /** A second, quieter action next to the first. */
  secondary?: React.ReactNode;
}) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-12 text-center md:py-16", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">
        <I size={20} strokeWidth={1.75} aria-hidden />
      </span>
      <h2 className="mt-3 text-label font-semibold text-text">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-meta text-muted">{description}</p>}
      {(action || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}

/** A placeholder block while something loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-control bg-surface-2", className)} />;
}

type Tone = "info" | "success" | "warn" | "danger";
const TONE: Record<Tone, { cls: string; icon: LucideIcon }> = {
  info: { cls: "border-border bg-surface-2/60 text-secondary", icon: Info },
  success: { cls: "border-success/30 bg-success/8 text-text", icon: CircleCheck },
  warn: { cls: "border-warn/35 bg-warn/8 text-text", icon: TriangleAlert },
  danger: { cls: "border-danger/35 bg-danger/8 text-text", icon: CircleAlert },
};
const ICON_TONE: Record<Tone, string> = {
  info: "text-muted",
  success: "text-success",
  warn: "text-warn",
  danger: "text-danger",
};

/** An inline message: a hint, a saved confirmation, a warning or an error. */
export function Callout({
  tone = "info",
  title,
  children,
  className,
  role,
  action,
}: {
  /** A button on the right (Retry). */
  action?: React.ReactNode;
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const t = TONE[tone];
  const I = t.icon;
  return (
    <div role={role} className={cx("flex items-start gap-2.5 rounded-control border px-3 py-2.5 text-meta", t.cls, className)}>
      <I size={16} strokeWidth={1.75} aria-hidden className={cx("mt-px shrink-0", ICON_TONE[tone])} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-text">{title}</p>}
        {children && <div className={cx(title && "mt-0.5", "text-secondary")}>{children}</div>}
      </div>
      {action && <div className="-my-1 shrink-0">{action}</div>}
    </div>
  );
}
