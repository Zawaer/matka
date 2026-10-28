import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cx } from "./cx";

const PAD = { none: "", sm: "p-3", md: "p-4 sm:p-5", lg: "p-5 sm:p-6" } as const;

export const cardClass = (opts: { padding?: keyof typeof PAD; interactive?: boolean } = {}) =>
  cx(
    "rounded-card border border-border bg-surface shadow-card",
    PAD[opts.padding ?? "md"],
    opts.interactive && "transition-colors hover:border-strong hover:bg-surface-2/50",
  );

/** The one container for grouped content. */
export function Card({
  as: As = "div",
  padding = "md",
  interactive,
  className,
  children,
  ...rest
}: {
  as?: "div" | "section" | "article" | "li" | "ul" | "ol";
  padding?: keyof typeof PAD;
  interactive?: boolean;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className">) {
  return (
    <As className={cx(cardClass({ padding, interactive }), className)} {...rest}>
      {children}
    </As>
  );
}

/** Title row inside a card: title (and a line under it) left, meta or an action right. */
export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-label font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-meta text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0 text-meta text-muted">{action}</div>}
    </div>
  );
}

/** A card holding rows (ListRow), divided by hairlines. */
export function CardList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ul className={cx(cardClass({ padding: "none" }), "divide-y divide-border overflow-hidden", className)}>{children}</ul>;
}

/**
 * One row of a list: leading icon, title and a meta line, a trailing value.
 * With `href` the whole row is a link with a chevron.
 */
export function ListRow({
  href,
  leading,
  title,
  meta,
  trailing,
  chevron = !!href,
  className,
}: {
  href?: string;
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-label text-text">{title}</div>
        {meta && <div className="mt-0.5 truncate text-meta text-muted">{meta}</div>}
      </div>
      {trailing != null && <div className="shrink-0 text-right text-meta tabular-nums text-secondary">{trailing}</div>}
      {chevron && <ChevronRight size={16} strokeWidth={1.75} className="-mr-1 shrink-0 text-muted" aria-hidden />}
    </>
  );
  const cls = cx("flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5", className);
  return (
    <li>
      {href ? (
        <Link href={href} className={cx(cls, "transition-colors hover:bg-surface-2/60 focus-visible:-outline-offset-2")}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
