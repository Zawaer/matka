export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="9" fill="var(--mk-primary)" />
      {/* winding route */}
      <path
        d="M8 23c3 0 3-6 6.5-6S21 23 24 20"
        stroke="var(--mk-bg)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="0.1 5"
        opacity="0.9"
      />
      {/* pin */}
      <circle cx="23.5" cy="10.5" r="3.4" fill="var(--mk-bg)" />
      <circle cx="23.5" cy="10.5" r="1.4" fill="var(--mk-primary)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo />
      <span className="text-lg font-semibold tracking-tight text-text">
        Matka
      </span>
    </div>
  );
}
