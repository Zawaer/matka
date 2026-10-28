import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cx } from "./cx";

const WIDTHS = {
  /** Reading width: timeline, settings, a single place. */
  narrow: "max-w-3xl",
  /** Most pages. */
  default: "max-w-5xl",
  /** Dense grids: places, insights. */
  wide: "max-w-6xl",
} as const;

/** The content column every page sits in: one set of widths and gutters. */
export function Page({
  width = "default",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cx("mx-auto w-full px-4 pb-10 pt-5 sm:px-6 md:px-10 md:pb-14 md:pt-9", WIDTHS[width], className)}>
      {children}
    </div>
  );
}

/** "‹ Places": the way back to a page's parent. */
export function BackLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "-ml-1.5 mb-3 inline-flex h-7 items-center gap-0.5 rounded-control pl-0.5 pr-2 text-meta font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text",
        className,
      )}
    >
      <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
      {children}
    </Link>
  );
}

/** A page's title row: title and a line under it, actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  leading,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  /** An icon tile or avatar before the title. */
  leading?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("mb-6 md:mb-8", className)}>
      {back && <BackLink href={back.href}>{back.label}</BackLink>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          {leading}
          <div className="min-w-0">
            <h1 className="text-title text-text">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A section's title (h2) with an optional line under it and an action on the right. */
export function SectionHeader({
  title,
  description,
  action,
  as: As = "h2",
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cx("mb-3 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <As className="text-heading text-text">{title}</As>
        {description && <p className="mt-0.5 text-meta text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
