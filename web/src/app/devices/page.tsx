import type { LucideIcon } from "lucide-react";
import { Ban, CircleAlert, CircleCheck, CircleDashed, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import { Badge, Button, CardList, IconTile, Page, PageHeader, SectionHeader, cx } from "@/components/ui";
import { BatteryCard } from "@/components/insights/BatteryCard";
import { QualityCard } from "@/components/insights/QualityCard";
import { getBatteryInsight, getQualityInsight } from "@/lib/insights/load";
import { PairDevice } from "@/components/devices/PairDevice";
import { appUrl, isDeviceSafeUrl } from "@/lib/appUrl";
import { requireUser } from "@/lib/auth";
import { listDevices, type Device } from "@/lib/devices";
import { deviceHealth, type Health } from "@/lib/heartbeat";
import { remove, revoke } from "./actions";
import { formatRelativeInstant, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Devices — Matka",
};

const fmt = (d: Date, timeZone: string) => `${formatRelativeInstant(d, timeZone)} ${formatTime(d, timeZone)}`;

export default async function DevicesPage() {
  const user = await requireUser();
  const [devices, battery, quality] = await Promise.all([
    listDevices(user.id),
    getBatteryInsight(user, 60).catch((err) => {
      console.error("[devices] battery failed:", err);
      return null;
    }),
    getQualityInsight(user, 30).catch((err) => {
      console.error("[devices] quality failed:", err);
      return null;
    }),
  ]);
  const hasBattery = !!battery?.days.some((d) => d.rate != null);
  const hasQuality = !!quality && (quality.periods.some((p) => p.total.fixes > 0) || quality.usage.length > 0);

  const active = devices.filter((d) => d.revoked_at == null);
  const revoked = devices.filter((d) => d.revoked_at != null);

  return (
    <Page width="narrow">
      <PageHeader
        title="Devices"
        subtitle={"Phones that record your location, and how well they do\u00a0it."}
      />

      <PairDevice insecure={!isDeviceSafeUrl(appUrl())} />

      <section className="mt-8">
        <SectionHeader
          title="Paired devices"
          description={
            devices.length
              ? `${active.length} active${revoked.length ? `, ${revoked.length} revoked` : ""}`
              : undefined
          }
        />
        {devices.length ? (
          <CardList>
            {[...active, ...revoked].map((d) => (
              <DeviceRow key={d.id} device={d} tz={user.timezone} />
            ))}
          </CardList>
        ) : (
          <p className="text-meta text-muted">
            No phones paired yet. Pair one above{hasBattery || hasQuality ? "; the history below came from a phone that has since been removed" : ""}.
          </p>
        )}
      </section>

      {(hasBattery || hasQuality) && (
        <section className="mt-8">
          <SectionHeader title="Recording quality" description="How exact your phone's locations are, and what recording costs in battery." />
          <div className="flex flex-col gap-4">
            {battery && hasBattery && <BatteryCard days={battery.days} annotations={battery.annotations} tz={user.timezone} />}
            {quality && hasQuality && <QualityCard data={quality} tz={user.timezone} />}
          </div>
        </section>
      )}
    </Page>
  );
}

const HEALTH: Record<Health["tone"], { cls: string; icon: LucideIcon }> = {
  ok: { cls: "text-success", icon: CircleCheck },
  warn: { cls: "text-warn", icon: TriangleAlert },
  bad: { cls: "text-danger font-medium", icon: CircleAlert },
  muted: { cls: "text-muted", icon: CircleDashed },
};

function DeviceRow({ device: d, tz }: { device: Device; tz: string }) {
  const revoked = d.revoked_at != null;
  // Recording health from the app's heartbeats (null for older apps).
  const health = revoked ? null : deviceHealth(d);
  const h = health ? HEALTH[health.tone] : null;
  return (
    <li className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <IconTile icon={Smartphone} className={revoked ? "opacity-60" : undefined} />
      <div className={cx("min-w-0 flex-1", revoked && "opacity-70")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-label text-text">{d.name}</span>
          {revoked && <Badge>Revoked</Badge>}
        </div>
        <div className="mt-0.5 text-meta text-muted">
          {revoked
            ? `Revoked ${fmt(d.revoked_at!, tz)}`
            : d.last_seen_at
              ? `Last upload ${fmt(d.last_seen_at, tz)}`
              : `Paired ${fmt(d.created_at, tz)} · not seen yet`}
        </div>
        {health && h ? (
          <div className={cx("mt-1 flex items-start gap-1.5 text-meta", h.cls)}>
            <h.icon size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
            <span>{health.text}</span>
          </div>
        ) : null}
      </div>
      {revoked ? (
        <form action={remove}>
          <input type="hidden" name="id" value={d.id} />
          <Button type="submit" size="sm" variant="ghost" icon={Trash2} title="Remove from this list. Its location history stays.">
            Remove
          </Button>
        </form>
      ) : (
        <form action={revoke}>
          <input type="hidden" name="id" value={d.id} />
          <Button type="submit" size="sm" variant="danger" icon={Ban}>
            Revoke
          </Button>
        </form>
      )}
    </li>
  );
}
