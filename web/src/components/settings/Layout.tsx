// Settings as an inset-grouped list: a muted group title outside the card,
// rows inside it divided by hairlines, each with its label (and a one-line
// hint) on the left and its control on the right. Server-safe.

import { cx } from "@/components/ui";

export function SettingsGroup({
  title,
  children,
  className,
  id,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** An anchor to link to (/settings#import). */
  id?: string;
}) {
  return (
    <section id={id} className={cx("scroll-mt-16", className)} aria-label={title}>
      <h2 className="mb-2 text-meta font-medium text-muted">{title}</h2>
      <div className="divide-y divide-border rounded-card border border-border bg-surface shadow-card">{children}</div>
    </section>
  );
}

/** One setting. `stack` puts a wide control under the label on phones. */
export function SettingRow({
  label,
  hint,
  control,
  below,
  stack,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  control?: React.ReactNode;
  /** Status lines and disclosures under the hint. */
  below?: React.ReactNode;
  stack?: boolean;
}) {
  return (
    <div
      className={cx(
        "relative flex gap-x-6 gap-y-3 px-4 py-3.5 sm:px-5",
        stack ? "flex-col sm:flex-row sm:items-start sm:justify-between" : "items-start justify-between",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-label text-text">{label}</div>
        {hint && <p className="mt-0.5 text-meta text-muted">{hint}</p>}
        {below && <div className="relative z-10">{below}</div>}
      </div>
      {control && <div className={cx("relative z-10 shrink-0", !stack && "pt-0.5")}>{control}</div>}
    </div>
  );
}

/** A full-width block inside a group (a form that needs the room). */
export function SettingBlock({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-4 sm:px-5">{children}</div>;
}
