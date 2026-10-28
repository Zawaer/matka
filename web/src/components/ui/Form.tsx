import { cx } from "./cx";

/** Text inputs, selects and textareas share one look. */
export const inputClass = cx(
  "h-9 w-full min-w-0 rounded-control border border-outline bg-surface px-3 text-sm text-text transition-colors",
  "placeholder:text-muted hover:border-outline focus:border-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-primary/40",
  "aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus-visible:outline-danger/40",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

export function Input({ className, ...rest }: React.ComponentProps<"input">) {
  return <input className={cx(inputClass, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputClass, "cursor-pointer pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputClass, "h-auto min-h-20 py-2", className)} {...rest} />;
}

/** A label above a control, with a hint or an error under it. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-label text-text">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-meta text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Checkbox and radio: native, in the accent colour. */
export const checkClass = "h-4 w-4 shrink-0 cursor-pointer accent-[var(--mk-primary)]";

/** An on/off switch: a native checkbox (role=switch) styled by .mk-switch in globals.css. */
export function Toggle({ className, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input type="checkbox" role="switch" className={cx("mk-switch", className)} {...rest} />;
}
