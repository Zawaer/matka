"use client";

import { useState, useSyncExternalStore } from "react";
import { appPairingLink, parsePairingFragment } from "@/lib/pairing";

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
      <div className="mk-card p-6">
        <h1 className="text-xl font-semibold">Pairing link incomplete</h1>
        <p className="mt-2 text-sm text-muted">
          This page needs the full link from a pairing QR code. In Matka on your computer, open
          Devices → Pair a device and scan the code it shows.
        </p>
      </div>
    );
  }

  const appLink = appPairingLink(pairing.server, pairing.token);
  return (
    <div className="mk-card flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Pair this phone with Matka</h1>
        <p className="mt-1 text-sm text-muted">
          Server: <span className="font-medium text-text">{pairing.server.replace(/^https?:\/\//, "")}</span>
        </p>
      </div>
      <a
        href={appLink}
        className="rounded-lg bg-primary px-4 py-3 text-center font-medium text-white"
      >
        Open in Matka
      </a>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Install the Matka app on this phone if you haven’t yet.</li>
        <li>Tap “Open in Matka”, check the server name and tap “Verify and pair”.</li>
        <li>
          If nothing happens, copy the link below, open Matka → Pair device → Enter manually and
          paste it into the server field (or enter the server and token separately).
        </li>
      </ol>
      <Copy label="Pairing link" value={appLink} />
      <Copy label="Server" value={pairing.server} />
      <Copy label="Token" value={pairing.token} />
      <p className="text-xs text-muted">
        The token is a password for uploading your location. Don’t share this page.
      </p>
    </div>
  );
}

function Copy({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
        <button type="button" onClick={copy} className="text-xs font-medium text-primary hover:underline">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <code className="mt-1 block select-all break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm">
        {value}
      </code>
    </div>
  );
}
