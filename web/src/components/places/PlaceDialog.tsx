"use client";

import { useRef } from "react";
import { MapPinPlus, Pencil, X } from "lucide-react";

/** Icons by name: a server page can't hand a component (a function) to this client one. */
const ICONS = { edit: Pencil, save: MapPinPlus } as const;
import { Button, IconButton } from "@/components/ui";

/**
 * A header button that opens a form in a dialog: a bottom sheet on phones
 * (drag handle, 16 px top corners), a centred dialog from `sm` up. Native
 * <dialog>: Esc closes and focus stays inside; a click on the backdrop
 * closes too. Submitting a form inside closes it (the server action still
 * runs and the page refreshes behind it).
 */
export function PlaceDialog({
  label,
  title,
  description,
  icon,
  variant = "secondary",
  children,
}: {
  label: string;
  title: string;
  description?: string;
  icon?: keyof typeof ICONS;
  variant?: "primary" | "secondary";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();
  return (
    <>
      <Button variant={variant} icon={icon ? ICONS[icon] : undefined} onClick={() => ref.current?.showModal()} aria-haspopup="dialog">
        {label}
      </Button>
      <dialog
        ref={ref}
        aria-label={title}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        onSubmit={() => {
          // After the browser hands the submission to React's action.
          setTimeout(close, 0);
        }}
        className="m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-border bg-surface p-0 text-text shadow-pop backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-card"
      >
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <span className="h-1 w-8 rounded-full bg-strong" />
        </div>
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-3 sm:pt-5">
          <div className="min-w-0">
            <h2 className="text-heading text-text">{title}</h2>
            {description && <p className="mt-0.5 text-meta text-muted">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" size="sm" onClick={close} className="-mr-2 -mt-1" />
        </div>
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">{children}</div>
      </dialog>
    </>
  );
}
