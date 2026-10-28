import { FileDown, LogOut } from "lucide-react";
import { Badge, Button, buttonClass, Page, PageHeader } from "@/components/ui";
import {
  AiPlacesRow,
  DawarichForm,
  ImmichForm,
  ImmichLinkRow,
  PhotoPointsRow,
  TimezoneRow,
  TransitRow,
} from "@/components/settings/Forms";
import { SettingBlock, SettingRow, SettingsGroup } from "@/components/settings/Layout";
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

/** "UTC+02:00" for a zone right now ("UTC" for zero). */
function offset(zone: string, now: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value;
    return (part ?? "GMT").replace("GMT", "UTC");
  } catch {
    return "";
  }
}

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
  const zoneNames = Intl.supportedValuesOf("timeZone");
  if (!zoneNames.includes(user.timezone)) zoneNames.unshift(user.timezone);
  const now = new Date();
  const zones = zoneNames.map((z) => ({ value: z, label: z.replace(/_/g, " "), hint: offset(z, now) }));

  const others = Math.max(0, Number(sessions) - 1);

  return (
    <Page width="narrow">
      <PageHeader title="Settings" subtitle={user.email ? `Signed in as ${user.email}` : undefined} />

      <div className="flex flex-col gap-8">
        <SettingsGroup title="General">
          <TimezoneRow current={user.timezone} zones={zones} />
        </SettingsGroup>

        <SettingsGroup title="Timeline">
          <TransitRow on={user.transitLines} available={configuredFeeds().length > 0} />
          {claudeConfigured() && <AiPlacesRow on={row.ai_places} />}
        </SettingsGroup>

        <SettingsGroup title="Photos">
          <SettingRow
            label="Immich"
            hint="Show your photos on the timeline and on places."
            control={row.has_key ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>}
          />
          <SettingBlock>
            <ImmichForm url={row.immich_url} connected={row.has_key} />
          </SettingBlock>
          {row.has_key && (
            <>
              <ImmichLinkRow url={row.immich_link_url} />
              <PhotoPointsRow on={row.photo_points} />
            </>
          )}
        </SettingsGroup>

        <SettingsGroup title="Import" id="import">
          <SettingRow label="Google Timeline" hint="Fill the gaps in your history from Google Maps Timeline." />
          <SettingBlock>
            <GoogleImport initial={googleImports} timeZone={user.timezone} />
          </SettingBlock>
          {dawarich && <DawarichForm lastCheck={dawarich.lastCheck} ready={dawarich.ready} timeZone={user.timezone} />}
        </SettingsGroup>

        <SettingsGroup title="Your data">
          <SettingRow
            stack
            label="Export"
            hint="Every recorded point. Visits and trips are worked out from these."
            control={
              <div className="flex gap-2">
                <a href="/api/export?format=csv" className={buttonClass()}>
                  <FileDown size={16} strokeWidth={1.75} aria-hidden />
                  CSV
                </a>
                <a href="/api/export?format=geojson" className={buttonClass()}>
                  <FileDown size={16} strokeWidth={1.75} aria-hidden />
                  GeoJSON
                </a>
              </div>
            }
          />
        </SettingsGroup>

        <SettingsGroup title="Sessions">
          <SettingRow
            stack
            label={
              others > 0 ? (
                <>
                  Signed in on <span className="tabular-nums">{others}</span> other {others === 1 ? "browser" : "browsers"}
                </>
              ) : (
                "Only signed in here"
              )
            }
            hint={others > 0 ? "Sign them out if you don't recognise them, or after using a shared computer." : undefined}
            control={
              others > 0 ? (
                <form action={signOutOthers}>
                  <Button type="submit" variant="danger" icon={LogOut}>
                    Sign out everywhere else
                  </Button>
                </form>
              ) : undefined
            }
          />
        </SettingsGroup>
      </div>
    </Page>
  );
}
