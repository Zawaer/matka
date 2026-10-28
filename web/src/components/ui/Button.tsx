import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-strong",
  secondary: "border border-border bg-surface text-text shadow-card hover:border-strong hover:bg-surface-2",
  ghost: "text-secondary hover:bg-surface-2 hover:text-text",
  danger: "border border-danger/35 bg-surface text-danger hover:bg-danger/10",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-meta",
  md: "h-9 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-5 text-sm",
};
const ICON_PX: Record<Size, number> = { sm: 16, md: 16, lg: 20 };

export const buttonClass = ({
  variant = "secondary",
  size = "md",
  block,
}: { variant?: Variant; size?: Size; block?: boolean } = {}) =>
  cx(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    block && "w-full",
  );

type Common = { variant?: Variant; size?: Size; block?: boolean; icon?: LucideIcon; iconRight?: LucideIcon };

function Inner({ icon: I, iconRight: R, size = "md", children }: Common & { children?: React.ReactNode }) {
  return (
    <>
      {I && <I size={ICON_PX[size]} strokeWidth={1.75} aria-hidden className="shrink-0" />}
      {children}
      {R && <R size={ICON_PX[size]} strokeWidth={1.75} aria-hidden className="shrink-0" />}
    </>
  );
}

export function Button({
  variant,
  size,
  block,
  icon,
  iconRight,
  className,
  children,
  type = "button",
  ...rest
}: Common & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cx(buttonClass({ variant, size, block }), className)} {...rest}>
      <Inner icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Inner>
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  icon,
  iconRight,
  className,
  children,
  href,
  ...rest
}: Common & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={cx(buttonClass({ variant, size, block }), className)} {...rest}>
      <Inner icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Inner>
    </Link>
  );
}

const ICON_BTN: Record<Size, string> = { sm: "h-8 w-8", md: "h-9 w-9", lg: "h-11 w-11" };

export const iconButtonClass = ({ variant = "ghost", size = "md" }: { variant?: Variant; size?: Size } = {}) =>
  cx(
    "inline-flex shrink-0 items-center justify-center rounded-control transition-colors disabled:pointer-events-none disabled:opacity-40",
    VARIANT[variant],
    variant === "ghost" && "text-muted",
    ICON_BTN[size],
  );

/** A square button with only an icon; `label` is its accessible name and tooltip. */
export function IconButton({
  icon: I,
  label,
  variant,
  size = "md",
  className,
  type = "button",
  ...rest
}: { icon: LucideIcon; label: string; variant?: Variant; size?: Size } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} aria-label={label} title={label} className={cx(iconButtonClass({ variant, size }), className)} {...rest}>
      <I size={ICON_PX[size]} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
