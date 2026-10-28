import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Database,
  Download,
  FileDown,
  Images,
  Import,
  LogOut,
  MonitorSmartphone,
  Smartphone,
  Sparkles,
  TramFront,
} from "lucide-react";
import { Badge, Button, buttonClass, Card, IconTile, ListRow, Page, PageHeader } from "@/components/ui";
import { AiPlacesForm, DawarichForm, ImmichForm, ImmichLinkForm, PhotoPointsForm, TimezoneForm, TransitForm } from "@/components/settings/Forms";
import { GoogleImport } from "@/components/settings/GoogleImport";
import { claudeConfigured } from "@/lib/claude";
import { dawarichStatus } from "@/lib/dawarichImport";
import { listImports } from "@/lib/google/import";
import { configuredFeeds } from "@/lib/transit/feed";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { signOutOthers } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings — Matka",
};

export default async function SettingsPage() {
  const user = await requireUser();
  const [[row], [{ sessions }], googleImports, dawarich] = await Promise.all([
    q<{ immich_url: string | null; immich_link_url: string | null; has_key: boolean; photo_points: boolean; ai_places: boolean }>(
      `SELECT immich_url, immich_link_url, immich_api_key IS NOT NULL AS has_key, photo_points, ai_places FROM users WHERE id = $1`,
      [user.id],
    ),
    q<{ sessions: string }>(
      `SELECT count(*) sessions FROM sessions WHERE user_id = $1 AND expires_at > now()`,
      [user.id],
    ),
    listImports(user.id),
    dawarichStatus(user.id),
  ]);
  const zones = Intl.supportedValuesOf("timeZone");
  if (!zones.includes(user.timezone)) zones.unshift(user.timezone);

  const others = Number(sessions) - 1;

  return (
    <Page width="narrow">
      <PageHeader
        title="Settings"
        subtitle={
          <>
            Signed in as {user.name}
            {user.email && user.email !== user.name ? ` (${user.email})` : ""}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <Section icon={Clock} title="Time zone">
          <TimezoneForm current={user.timezone} zones={zones} />
        </Section>

        <Section icon={TramFront} title="Public transport">
          <TransitForm on={user.transitLines} available={configuredFeeds().length > 0} />
        </Section>

        {claudeConfigured() && (
          <Section icon={Sparkles} title="Place names">
            <AiPlacesForm on={row.ai_places} />
          </Section>
        )}

        <Section
          icon={Images}
          title="Immich photos"
          description="Show your photos on the timeline and on places."
          badge={row.has_key ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>}
        >
          <ImmichForm url={row.immich_url} connected={row.has_key} />
          {row.has_key && (
            <>
              <div className="mt-5 border-t border-border pt-5">
                <ImmichLinkForm url={row.immich_link_url} />
              </div>
              <div className="mt-5 border-t border-border pt-5">
                <PhotoPointsForm on={row.photo_points} />
              </div>
            </>
          )}
        </Section>

        <Section icon={Import} title="Import Google Timeline" description="Fill the gaps in your history from Google Maps Timeline.">
          <GoogleImport initial={googleImports} timeZone={user.timezone} />
        </Section>

        {dawarich && (
          <Section icon={Database} title="Dawarich">
            <DawarichForm lastCheck={dawarich.lastCheck} ready={dawarich.ready} timeZone={user.timezone} />
          </Section>
        )}

        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-border">
            <ListRow
              href="/devices"
              leading={<IconTile icon={Smartphone} />}
              title="Devices"
              meta="Phones that record and upload your location"
            />
          </ul>
        </Card>

        <Section icon={Download} title="Your data" description="Download every recorded point. Visits and trips are recomputed from these.">
          <div className="flex flex-wrap gap-2">
            <a href="/api/export?format=csv" className={buttonClass()}>
              <FileDown size={16} strokeWidth={1.75} aria-hidden />
              CSV
            </a>
            <a href="/api/export?format=geojson" className={buttonClass()}>
              <FileDown size={16} strokeWidth={1.75} aria-hidden />
              GeoJSON
            </a>
          </div>
        </Section>

        <Section
          icon={MonitorSmartphone}
          title="Sessions"
          description={
            <>
              You are signed in on <span className="tabular-nums">{sessions}</span>{" "}
              {Number(sessions) === 1 ? "browser" : "browsers"}.
            </>
          }
        >
          {others > 0 ? (
            <form action={signOutOthers}>
              <Button type="submit" variant="danger" icon={LogOut}>
                Sign out everywhere else
              </Button>
            </form>
          ) : (
            <p className="text-meta text-muted">This is the only one.</p>
          )}
        </Section>
      </div>
    </Page>
  );
}

/** One settings group: an icon, a title and what it's for, then its controls. */
function Section({
  icon,
  title,
  description,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card as="section" padding="none">
      <div className={`flex gap-3 border-b border-border px-4 py-3 sm:px-5 ${description ? "items-start" : "items-center"}`}>
        <IconTile icon={icon} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-heading text-text">{title}</h2>
            {badge}
          </div>
          {description && <p className="mt-0.5 text-meta text-muted">{description}</p>}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </Card>
  );
}
