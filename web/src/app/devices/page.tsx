import { PairDevice } from "@/components/devices/PairDevice";
import { appUrl, isDeviceSafeUrl } from "@/lib/appUrl";
import { requireUser } from "@/lib/auth";
import { listDevices, type Device } from "@/lib/devices";
import { deviceHealth, type Health } from "@/lib/heartbeat";
import { remove, revoke } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Devices — Matka",
};

const fmt = (d: Date, timeZone: string) =>
  d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone });

export default async function DevicesPage() {
  const user = await requireUser();
  const devices = await listDevices(user.id);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Devices</h1>
        <p className="mt-1 text-muted">Phones that upload your location to Matka.</p>
      </header>

      <PairDevice insecure={!isDeviceSafeUrl(appUrl())} />

      <section className="mt-6 flex flex-col gap-2">
        {devices.length === 0 ? (
          <p className="px-1 text-sm text-muted">No devices paired yet.</p>
        ) : (
          devices.map((d) => <DeviceRow key={d.id} device={d} tz={user.timezone} />)
        )}
      </section>
    </div>
  );
}

const HEALTH_CLASS: Record<Health["tone"], string> = {
  ok: "text-primary",
  warn: "text-amber-500",
  bad: "font-medium text-red-500",
  muted: "text-muted",
};

function DeviceRow({ device: d, tz }: { device: Device; tz: string }) {
  const revoked = d.revoked_at != null;
  // Recording health from the app's heartbeats (null for older apps).
  const health = revoked ? null : deviceHealth(d);
  return (
    <div className="mk-card flex items-center gap-4 px-5 py-4">
      <div className={`min-w-0 flex-1 ${revoked ? "opacity-60" : ""}`}>
        <div className="truncate font-medium">{d.name}</div>
        <div className="text-sm text-muted">
          {revoked
            ? `Revoked ${fmt(d.revoked_at!, tz)}`
            : d.last_seen_at
              ? `Last upload ${fmt(d.last_seen_at, tz)}`
              : `Paired ${fmt(d.created_at, tz)} · not seen yet`}
        </div>
        {health ? <div className={`text-sm ${HEALTH_CLASS[health.tone]}`}>{health.text}</div> : null}
      </div>
      {revoked ? (
        <form action={remove}>
          <input type="hidden" name="id" value={d.id} />
          <button
            type="submit"
            title="Remove from this list. Its location history stays."
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:border-red-500 hover:text-red-500"
          >
            Remove
          </button>
        </form>
      ) : (
        <form action={revoke}>
          <input type="hidden" name="id" value={d.id} />
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:border-red-500 hover:text-red-500"
          >
            Revoke
          </button>
        </form>
      )}
    </div>
  );
}
