"use client";

import { useActionState } from "react";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { checkDawarich, saveAiPlaces, saveImmich, saveImmichLink, savePhotoPoints, saveTimezone, saveTransit, type FormResult } from "@/app/settings/actions";
import { Button, Field, Input, Select, Toggle, cx } from "@/components/ui";

/** A form action's answer, next to its button. */
export function Result({ r }: { r: FormResult }) {
  if (!r) return null;
  const I = r.ok ? CircleCheck : CircleAlert;
  return (
    <p
      role={r.ok ? "status" : "alert"}
      className={cx("flex min-w-0 items-center gap-1.5 text-meta", r.ok ? "text-success" : "text-danger")}
    >
      <I size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className="min-w-0">{r.message}</span>
    </p>
  );
}

/** The row under a form: its buttons, then the result. */
function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>;
}

/** A switch with its title and explanation: the whole row is the label. */
function ToggleRow({
  name,
  on,
  disabled,
  title,
  children,
}: {
  name: string;
  on: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cx("flex items-start justify-between gap-4", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      <span className="min-w-0">
        <span className="block text-label text-text">{title}</span>
        <span className="mt-1 block text-meta text-muted">{children}</span>
      </span>
      <Toggle name={name} defaultChecked={on} disabled={disabled} className="mt-0.5" />
    </label>
  );
}

export function TimezoneForm({ current, zones }: { current: string; zones: string[] }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(saveTimezone, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Time zone" htmlFor="timezone" hint="Decides where days start on the timeline.">
        <Select id="timezone" name="timezone" defaultValue={current} className="sm:max-w-sm">
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </Select>
      </Field>
      <Actions>
        <Button type="submit" disabled={pending}>
          Save
        </Button>
        <Result r={r} />
      </Actions>
    </form>
  );
}

export function ImmichForm({ url, connected }: { url: string | null; connected: boolean }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(saveImmich, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Server URL" htmlFor="immich-url">
        <Input id="immich-url" name="url" defaultValue={url ?? ""} placeholder="http://immich_server:2283" />
      </Field>
      <Field
        label="API key"
        htmlFor="immich-key"
        hint={
          <>
            Create a key in Immich under Account settings → API keys with the permissions asset.read and asset.view.
            It is stored encrypted and only used by the server.
          </>
        }
      >
        <Input
          id="immich-key"
          name="key"
          type="password"
          autoComplete="off"
          placeholder={connected ? "Stored. Enter a new key to replace it" : ""}
        />
      </Field>
      <Actions>
        <Button type="submit" disabled={pending}>
          {connected ? "Update" : "Connect"}
        </Button>
        {connected && (
          <Button type="submit" name="disconnect" value="1" variant="danger" disabled={pending}>
            Disconnect
          </Button>
        )}
        <Result r={r} />
      </Actions>
    </form>
  );
}

export function ImmichLinkForm({ url }: { url: string | null }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(saveImmichLink, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        label={
          <>
            Immich address for links <span className="font-normal text-muted">(optional)</span>
          </>
        }
        htmlFor="immich-link"
        hint={
          <>
            Where you open Immich in your browser. Photos on the timeline link there; leave it empty to view them in
            Matka only. The server URL above is often a container address your devices can&apos;t open.
          </>
        }
      >
        <Input id="immich-link" name="link_url" defaultValue={url ?? ""} placeholder="https://immich.lan" />
      </Field>
      <Actions>
        <Button type="submit" disabled={pending}>
          Save
        </Button>
        <Result r={r} />
      </Actions>
    </form>
  );
}

export function TransitForm({ on, available }: { on: boolean; available: boolean }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(saveTransit, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <ToggleRow name="transit_lines" on={on} disabled={!available} title="Show public transport lines">
        Matches your trips against published routes (HSL in the Helsinki region) and shows the bus, tram, metro or
        train line you rode, like &ldquo;Bus 159, Leppävaara &rarr; Matinkylä&rdquo;. Matching happens on this server;
        nothing about your trips is sent anywhere.
      </ToggleRow>
      {!available && <p className="text-meta text-muted">Turned off for this server (MATKA_TRANSIT_FEEDS=off).</p>}
      <Actions>
        <Button type="submit" disabled={pending || !available}>
          Save
        </Button>
        <Result r={r} />
      </Actions>
    </form>
  );
}

export function AiPlacesForm({ on }: { on: boolean }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(saveAiPlaces, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <ToggleRow name="ai_places" on={on} title="Let AI pick between nearby places">
        Where several shops, cafés or venues are next to each other, Claude (Anthropic&rsquo;s AI, through this
        server&rsquo;s shared account) guesses which one you were at from when and how long you stay. It is sent only
        the candidates&rsquo; names, types and distances in metres, whether a street address is an option (not the
        address), and your visits there in local time: how many, the usual start hour and length, and how many fall on
        weekends or at night. Never coordinates, addresses, dates or your tracks. Saved and renamed places are left
        out, bars, clinics and places of worship are never suggested, and only confident picks are used. Turning this
        off removes the picks.
      </ToggleRow>
      <Actions>
        <Button type="submit" disabled={pending}>
          Save
        </Button>
        <Result r={r} />
      </Actions>
    </form>
  );
}

export function PhotoPointsForm({ on }: { on: boolean }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(savePhotoPoints, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <ToggleRow name="photo_points" on={on} title="Fill gaps from photo locations">
        A geotagged photo shows where you were when you took it. Where nothing was recorded (before you used Matka, or
        with the phone off), those spots are added to your history. Screenshots and saved images are ignored. Turning
        this off removes them again.
      </ToggleRow>
      <Actions>
        <Button type="submit" disabled={pending}>
          Save
        </Button>
        <Result r={r} />
      </Actions>
    </form>
  );
}

export function DawarichForm({ lastCheck, ready, timeZone }: { lastCheck: string | null; ready: boolean; timeZone: string }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(checkDawarich, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-secondary">
          Your Dawarich history was copied in once. Points Dawarich records later are added once a day where Matka has
          nothing of its own within 10 minutes; Dawarich is only read.
        </p>
        <p className="mt-1.5 text-meta text-muted">
          {!ready
            ? "The first import is still running."
            : lastCheck
              ? `Last checked ${new Date(lastCheck).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone })}.`
              : "Not checked for new points yet."}
        </p>
      </div>
      <Actions>
        <Button type="submit" icon={RefreshCw} disabled={pending || !ready}>
          {pending ? "Checking…" : "Check for new points"}
        </Button>
        <Result r={r} />
      </Actions>
    </form>
  );
}
