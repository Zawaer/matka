"use client";

import { useActionState } from "react";
import { saveImmich, savePhotoPoints, saveTimezone, saveTransit, type FormResult } from "@/app/settings/actions";

const input =
  "mt-1.5 block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";
const button =
  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60";

function Result({ r }: { r: FormResult }) {
  if (!r) return null;
  return <p className={`text-sm ${r.ok ? "text-primary" : "text-red-500"}`}>{r.message}</p>;
}

export function TimezoneForm({ current, zones }: { current: string; zones: string[] }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(saveTimezone, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="text-sm font-medium">
        Time zone
        <select name="timezone" defaultValue={current} className={input}>
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted">Decides where days start on the timeline.</p>
      <div className="flex items-center gap-3">
        <button className={button} disabled={pending}>
          Save
        </button>
        <Result r={r} />
      </div>
    </form>
  );
}

export function ImmichForm({ url, connected }: { url: string | null; connected: boolean }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(saveImmich, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="text-sm font-medium">
        Server URL
        <input
          name="url"
          defaultValue={url ?? ""}
          placeholder="http://immich_server:2283"
          className={input}
        />
      </label>
      <label className="text-sm font-medium">
        API key
        <input
          name="key"
          type="password"
          autoComplete="off"
          placeholder={connected ? "•••••••• (stored — enter a new one to replace)" : ""}
          className={input}
        />
      </label>
      <p className="text-xs text-muted">
        Create a key in Immich under Account settings → API keys (asset read access is enough). It
        is stored encrypted and only used by the server.
      </p>
      <div className="flex items-center gap-3">
        <button className={button} disabled={pending}>
          {connected ? "Update" : "Connect"}
        </button>
        {connected && (
          <button
            name="disconnect"
            value="1"
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-text"
            disabled={pending}
          >
            Disconnect
          </button>
        )}
        <Result r={r} />
      </div>
    </form>
  );
}

export function TransitForm({ on, available }: { on: boolean; available: boolean }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(saveTransit, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="transit_lines"
          defaultChecked={on}
          disabled={!available}
          className="mt-0.5 h-4 w-4 accent-[color:var(--mk-primary)]"
        />
        <span>
          <span className="font-medium">Show public transport lines</span>
          <span className="mt-0.5 block text-xs text-muted">
            Matches your trips against published routes (HSL in the Helsinki region) and
            shows the bus, tram, metro or train line you rode, like &ldquo;Bus 159,
            Leppävaara &rarr; Matinkylä&rdquo;. Matching happens on this server; nothing about
            your trips is sent anywhere.
          </span>
        </span>
      </label>
      {!available && (
        <p className="text-xs text-muted">Turned off for this server (MATKA_TRANSIT_FEEDS=off).</p>
      )}
      <div className="flex items-center gap-3">
        <button className={button} disabled={pending || !available}>
          Save
        </button>
        <Result r={r} />
      </div>
    </form>
  );
}

export function PhotoPointsForm({ on }: { on: boolean }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(savePhotoPoints, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="photo_points"
          defaultChecked={on}
          className="mt-0.5 h-4 w-4 accent-[color:var(--mk-primary)]"
        />
        <span>
          <span className="font-medium">Fill gaps from photo locations</span>
          <span className="mt-0.5 block text-xs text-muted">
            A geotagged photo shows where you were when you took it. Where nothing was recorded
            (before you used Matka, or with the phone off), those spots are added to your history.
            Screenshots and saved images are ignored. Turning this off removes them again.
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button className={button} disabled={pending}>
          Save
        </button>
        <Result r={r} />
      </div>
    </form>
  );
}
