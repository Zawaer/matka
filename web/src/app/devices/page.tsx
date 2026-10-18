import { PairDevice } from "@/components/devices/PairDevice";
import { appUrl, isDeviceSafeUrl } from "@/lib/appUrl";
import { requireSession } from "@/lib/auth";
import { listDevices, type Device } from "@/lib/devices";
import { revoke } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Devices — Matka",
};

const fmt = (d: Date) =>
  d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Helsinki" });

export default async function DevicesPage() {
  await requireSession();
  const devices = await listDevices();

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
          devices.map((d) => <DeviceRow key={d.id} device={d} />)
        )}
      </section>
    </div>
  );
}

function DeviceRow({ device: d }: { device: Device }) {
  const revoked = d.revoked_at != null;
  return (
    <div className={`mk-card flex items-center gap-4 px-5 py-4 ${revoked ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{d.name}</div>
        <div className="text-sm text-muted">
          {revoked
            ? `Revoked ${fmt(d.revoked_at!)}`
            : d.last_seen_at
              ? `Last upload ${fmt(d.last_seen_at)}`
              : `Paired ${fmt(d.created_at)} · not seen yet`}
        </div>
      </div>
      {!revoked && (
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
