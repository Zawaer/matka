"use client";

import { useActionState } from "react";
import { ExternalLink, QrCode } from "lucide-react";
import { pairDevice, type PairResult } from "@/app/devices/actions";
import { Button, Callout, Card, Field, IconTile, Input, cx } from "@/components/ui";
import { CopyField } from "@/components/ui/CopyField";

export function PairDevice({ insecure }: { insecure: boolean }) {
  const [result, action, pending] = useActionState<PairResult, FormData>(pairDevice, null);

  if (result?.ok) {
    return (
      <Card padding="lg" className="flex flex-col gap-6 md:flex-row md:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, nothing to optimize */}
        <img
          src={result.qr}
          alt="Pairing QR code"
          width={280}
          height={280}
          // White card with its own quiet zone so it scans in dark mode too.
          className="mx-auto aspect-square w-full max-w-[280px] shrink-0 rounded-control border border-border bg-white md:mx-0"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div>
            <h2 className="text-heading text-text">Pair &ldquo;{result.name}&rdquo;</h2>
            <p className="mt-1 text-meta text-muted">
              Scan this with the Matka app (Pair device → Scan QR), or with the phone’s camera and tap “Open in
              Matka”.
            </p>
          </div>
          <Callout tone="warn">
            This is the only time the token is shown. If you lose it, revoke the device and pair it again.
          </Callout>
          <div className="flex flex-col gap-1.5">
            <CopyField label="Pairing link" value={result.link} />
            <p className="text-meta text-muted">Or paste it into the app’s “Enter manually” tab.</p>
          </div>
          <CopyField label="Token" value={result.token} />
          <a
            href={result.link}
            className="inline-flex items-center gap-1.5 self-start text-meta font-medium text-primary hover:underline"
          >
            Open pairing page on this device
            <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
          </a>
        </div>
      </Card>
    );
  }

  return (
    <Card as="section" padding="none">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <IconTile icon={QrCode} />
        <div className="min-w-0">
          <h2 className="text-heading text-text">Pair your phone</h2>
          <p className="mt-0.5 text-meta text-muted">Name the phone, then scan the QR code with the Matka app.</p>
        </div>
      </div>
      <form action={action} className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field
            label="Device name"
            htmlFor="device-name"
            className="flex-1"
            error={result && !result.ok ? result.error : undefined}
          >
            <Input id="device-name" name="name" required maxLength={64} placeholder="e.g. Pixel 8" />
          </Field>
          <Button type="submit" variant="primary" icon={QrCode} disabled={pending} className={cx("self-start sm:self-auto", result && !result.ok && "sm:mb-6")}>
            {pending ? "Pairing…" : "Pair"}
          </Button>
        </div>
        {insecure && (
          <Callout tone="warn">APP_URL is not https: phones will refuse to pair outside development.</Callout>
        )}
      </form>
    </Card>
  );
}
