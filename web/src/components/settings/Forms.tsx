"use client";

import { startTransition, useActionState, useState } from "react";
import { ChevronRight, CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { checkDawarich, saveAiPlaces, saveImmich, saveImmichLink, savePhotoPoints, saveTimezone, saveTransit, type FormResult } from "@/app/settings/actions";
import { Button, Combobox, Input, Toggle, cx, type ComboOption } from "@/components/ui";
import { SettingRow } from "./Layout";
import { formatDateShort, formatTime } from "@/lib/format";

/** A form action's answer: a short line under the setting. */
export function Result({ r, pending }: { r: FormResult; pending?: boolean }) {
  if (pending) return <p className="mt-1 text-meta text-muted">Saving…</p>;
  if (!r) return null;
  const I = r.ok ? CircleCheck : CircleAlert;
  return (
    <p
      role={r.ok ? "status" : "alert"}
      className={cx("mt-1 flex min-w-0 items-start gap-1.5 text-meta", r.ok ? "text-success" : "text-danger")}
    >
      <I size={16} strokeWidth={1.75} aria-hidden className="mt-px shrink-0" />
      <span className="min-w-0">{r.message}</span>
    </p>
  );
}

/** "What is sent ▸": the long explanation behind a disclosure. */
export function More({ summary = "Details", children }: { summary?: string; children: React.ReactNode }) {
  return (
    <details className="group mt-1.5 text-meta text-muted">
      <summary className="inline-flex cursor-pointer list-none items-center gap-0.5 rounded-sm font-medium text-secondary hover:text-text [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="mt-1 pl-[18px]">{children}</div>
    </details>
  );
}

type Action = (prev: FormResult, form: FormData) => Promise<FormResult>;

/** A switch that saves the moment it changes; the answer shows under its label. */
function AutoToggle({
  action,
  name,
  on,
  disabled,
  label,
  hint,
  details,
}: {
  action: Action;
  name: string;
  on: boolean;
  disabled?: boolean;
  label: string;
  hint: React.ReactNode;
  details?: React.ReactNode;
}) {
  const [r, dispatch, pending] = useActionState<FormResult, FormData>(action, null);
  const [checked, setChecked] = useState(on);
  const id = `setting-${name}`;
  return (
    <SettingRow
      label={
        disabled ? (
          <span className="text-muted">{label}</span>
        ) : (
          // The whole row is the switch's label: a big target on phones.
          <label htmlFor={id} className="cursor-pointer after:absolute after:inset-0 after:content-['']">
            {label}
          </label>
        )
      }
      hint={hint}
      below={
        <>
          {details}
          <Result r={r} pending={pending} />
        </>
      }
      control={
        disabled ? (
          <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 text-caption font-medium text-muted">
            Not available
          </span>
        ) : (
        <Toggle
          id={id}
          checked={disabled ? false : checked}
          disabled={disabled || pending}
          onChange={(e) => {
            const v = e.target.checked;
            setChecked(v);
            const fd = new FormData();
            if (v) fd.set(name, "on");
            startTransition(() => dispatch(fd));
          }}
        />
        )
      }
    />
  );
}

export function TimezoneRow({ current, zones }: { current: string; zones: ComboOption[] }) {
  const [r, dispatch, pending] = useActionState<FormResult, FormData>(saveTimezone, null);
  const [value, setValue] = useState(current);
  return (
    <SettingRow
      stack
      label="Time zone"
      hint="Decides where days start on the timeline."
      below={<Result r={r} pending={pending} />}
      control={
        <Combobox
          label="Time zone"
          placeholder="Search, e.g. Helsinki"
          value={value}
          options={zones}
          disabled={pending}
          className="w-full sm:w-80"
          onChange={(v) => {
            setValue(v);
            const fd = new FormData();
            fd.set("timezone", v);
            startTransition(() => dispatch(fd));
          }}
        />
      }
    />
  );
}

export function TransitRow({ on, available }: { on: boolean; available: boolean }) {
  return (
    <AutoToggle
      action={saveTransit}
      name="transit_lines"
      on={on}
      disabled={!available}
      label="Public transport lines"
      hint={
        available
          ? "Shows the bus, tram, metro or train line you rode, like “Bus 159, Leppävaara → Matinkylä”."
          : "Needs the transit feeds, which this server doesn't have."
      }
      details={
        available ? (
          <More>Trips are matched against published routes (HSL in the Helsinki region) on this server; nothing is sent anywhere.</More>
        ) : null
      }
    />
  );
}

export function AiPlacesRow({ on }: { on: boolean }) {
  return (
    <AutoToggle
      action={saveAiPlaces}
      name="ai_places"
      on={on}
      label="Let AI pick between nearby places"
      hint="Claude guesses between nearby venues. Only names and visit patterns are sent."
      details={
        <More summary="What is sent">
          For places with several shops, cafés or venues next to each other, Claude (Anthropic&rsquo;s AI, through this
          server&rsquo;s account) gets the candidates&rsquo; names, types and distances in metres, whether a street
          address is an option, and your visits there in local time: how many, the usual start hour and length, and how
          many fall on weekends or at night. Never coordinates, addresses, dates or your tracks. Saved and renamed places
          are left out, bars, clinics and places of worship are never suggested, and only confident picks are used.
          Turning this off removes the picks.
        </More>
      }
    />
  );
}

export function PhotoPointsRow({ on }: { on: boolean }) {
  return (
    <AutoToggle
      action={savePhotoPoints}
      name="photo_points"
      on={on}
      label="Fill gaps from photo locations"
      hint="Where nothing was recorded, the places your photos were taken are added to your history."
      details={
        <More>
          This covers time before you used Matka or with the phone off. Screenshots and saved images are ignored.
          Turning this off removes those points again.
        </More>
      }
    />
  );
}

export function ImmichForm({ url, connected }: { url: string | null; connected: boolean }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(saveImmich, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-meta font-medium text-secondary">Server address</span>
          <Input name="url" defaultValue={url ?? ""} placeholder="https://photos.example.com" />
          <span className="text-caption text-muted">In Docker, the container name works: http://immich_server:2283</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-meta font-medium text-secondary">API key</span>
          <Input
            name="key"
            type="password"
            autoComplete="off"
            placeholder={connected ? "Stored. Enter a new key to replace it" : ""}
          />
        </label>
      </div>
      <p className="text-meta text-muted">
        Create a key in Immich under Account settings → API keys, with the permissions asset.read and asset.view.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant={connected ? "secondary" : "primary"} disabled={pending}>
          {connected ? "Update" : "Connect"}
        </Button>
        {connected && (
          <Button type="submit" name="disconnect" value="1" variant="ghost" disabled={pending}>
            Disconnect
          </Button>
        )}
      </div>
      <Result r={r} pending={pending} />
    </form>
  );
}

export function ImmichLinkRow({ url }: { url: string | null }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(saveImmichLink, null);
  return (
    <SettingRow
      stack
      label="Address for opening photos"
      hint="Where you open Immich in your browser. Leave it empty to view photos in Matka only."
      below={<Result r={r} pending={pending} />}
      control={
        <form action={action} className="flex w-full gap-2 sm:w-80">
          <Input name="link_url" aria-label="Immich address for links" defaultValue={url ?? ""} placeholder="https://immich.lan" />
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      }
    />
  );
}

export function DawarichForm({ lastCheck, ready, timeZone }: { lastCheck: string | null; ready: boolean; timeZone: string }) {
  const [r, action, pending] = useActionState<FormResult, FormData>(checkDawarich, null);
  return (
    <SettingRow
      stack
      label="Dawarich"
      hint={
        !ready
          ? "The first import is still running."
          : lastCheck
            ? `New points are added once a day. Last checked ${formatDateShort(lastCheck, timeZone)} ${formatTime(lastCheck, timeZone)}.`
            : "New points are added once a day."
      }
      below={
        <>
          <More>
            Your Dawarich history was copied in once. Points Dawarich records later are added where Matka has nothing of
            its own within 10 minutes; Dawarich is only read.
          </More>
          <Result r={r} pending={false} />
        </>
      }
      control={
        <form action={action}>
          <Button type="submit" icon={RefreshCw} disabled={pending || !ready}>
            {pending ? "Checking…" : "Check now"}
          </Button>
        </form>
      }
    />
  );
}
