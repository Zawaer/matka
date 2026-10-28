"use client";

import { useActionState } from "react";
import { checkDawarich, saveAiPlaces, saveImmich, savePhotoPoints, saveTimezone, saveTransit, type FormResult } from "@/app/settings/actions";

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
        Create a key in Immich under Account settings → API keys with the permissions asset.read and asset.view. It
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

export function AiPlacesForm({ on }: { on: boolean }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(saveAiPlaces, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="ai_places"
          defaultChecked={on}
          className="mt-0.5 h-4 w-4 accent-[color:var(--mk-primary)]"
        />
        <span>
          <span className="font-medium">Let AI pick between nearby places</span>
          <span className="mt-0.5 block text-xs text-muted">
            Where several shops, cafés or venues are next to each other, Claude (Anthropic&rsquo;s AI,
            through this server&rsquo;s shared account) guesses which one you were at from when and how
            long you stay. It is sent only the candidates&rsquo; names, types and distances in metres,
            whether a street address is an option (not the address), and your visits there in local
            time: how many, the usual start hour and length, and how many fall on weekends or at
            night. Never coordinates, addresses, dates or your tracks. Saved and renamed places are
            left out, bars, clinics and places of worship are never suggested, and only confident
            picks are used. Turning this off removes the picks.
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

export function DawarichForm({ lastCheck, ready, timeZone }: { lastCheck: string | null; ready: boolean; timeZone: string }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(checkDawarich, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Your Dawarich history was copied in once. Points Dawarich records later are added once a
        day where Matka has nothing of its own within 10 minutes; Dawarich is only read.
      </p>
      <p className="text-xs text-muted">
        {!ready
          ? "The first import is still running."
          : lastCheck
            ? `Last checked ${new Date(lastCheck).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone })}.`
            : "Not checked for new points yet."}
      </p>
      <div className="flex items-center gap-3">
        <button className={button} disabled={pending || !ready}>
          {pending ? "Checking…" : "Check Dawarich for new points"}
        </button>
        <Result r={r} />
      </div>
    </form>
  );
}
