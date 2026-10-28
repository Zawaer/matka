"use client";

import { useSyncExternalStore } from "react";
import { Link2Off, Smartphone } from "lucide-react";
import { appPairingLink, parsePairingFragment } from "@/lib/pairing";
import { Callout, IconTile, buttonClass } from "@/components/ui";
import { CopyField } from "@/components/ui/CopyField";

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
// null on the server: the fragment only exists in the browser.
const getHash = () => window.location.hash;
const getServerHash = () => null;

export function PairLanding() {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  if (hash == null) return null;

  const pairing = parsePairingFragment(hash, window.location.origin, window.location.pathname);
  if (!pairing) {
    return (
      <div className="flex flex-col items-center text-center">
        <IconTile icon={Link2Off} size="lg" />
        <h1 className="mt-4 text-heading text-text">Pairing link incomplete</h1>
        <p className="mt-1.5 text-meta text-muted">
          This page needs the full link from a pairing QR code. In Matka on your computer, open Devices → Pair a
          device and scan the code it shows.
        </p>
      </div>
    );
  }

  const appLink = appPairingLink(pairing.server, pairing.token);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <IconTile icon={Smartphone} size="lg" tone="primary" />
        <div className="min-w-0">
          <h1 className="text-heading text-text">Pair this phone with Matka</h1>
          <p className="mt-0.5 truncate text-meta text-muted">
            Server <span className="font-medium text-text">{pairing.server.replace(/^https?:\/\//, "")}</span>
          </p>
        </div>
      </div>
      <a href={appLink} className={buttonClass({ variant: "primary", size: "lg", block: true })}>
        Open in Matka
      </a>
      <ol className="flex flex-col gap-2 text-meta text-secondary">
        {[
          "Install the Matka app on this phone if you haven’t yet.",
          "Tap “Open in Matka”, check the server name and tap “Verify and pair”.",
          "If nothing happens, copy the link below, open Matka → Pair device → Enter manually and paste it into the server field (or enter the server and token separately).",
        ].map((t, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-caption font-medium tabular-nums text-muted">
              {i + 1}
            </span>
            <span className="min-w-0">{t}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <CopyField label="Pairing link" value={appLink} />
        <CopyField label="Server" value={pairing.server} />
        <CopyField label="Token" value={pairing.token} />
      </div>
      <Callout tone="warn">The token is a password for uploading your location. Don’t share this page.</Callout>
    </div>
  );
}
