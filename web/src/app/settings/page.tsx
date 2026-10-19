import { AiPlacesForm, ImmichForm, PhotoPointsForm, TimezoneForm, TransitForm } from "@/components/settings/Forms";
import { claudeConfigured } from "@/lib/claude";
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
  const [[row], [{ sessions }]] = await Promise.all([
    q<{ immich_url: string | null; has_key: boolean; photo_points: boolean; ai_places: boolean }>(
      `SELECT immich_url, immich_api_key IS NOT NULL AS has_key, photo_points, ai_places FROM users WHERE id = $1`,
      [user.id],
    ),
    q<{ sessions: string }>(
      `SELECT count(*) sessions FROM sessions WHERE user_id = $1 AND expires_at > now()`,
      [user.id],
    ),
  ]);
  const zones = Intl.supportedValuesOf("timeZone");
  if (!zones.includes(user.timezone)) zones.unshift(user.timezone);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted">
          Signed in as {user.name}
          {user.email && user.email !== user.name ? ` (${user.email})` : ""}.
        </p>
      </header>

      <div className="flex flex-col gap-5">
        <Section title="Timeline">
          <TimezoneForm current={user.timezone} zones={zones} />
        </Section>

        <Section title="Public transport">
          <TransitForm on={user.transitLines} available={configuredFeeds().length > 0} />
        </Section>

        {claudeConfigured() && (
          <Section title="Place names">
            <AiPlacesForm on={row.ai_places} />
          </Section>
        )}

        <Section title="Immich photos">
          <ImmichForm url={row.immich_url} connected={row.has_key} />
          {row.has_key && (
            <div className="mt-5 border-t border-border pt-5">
              <PhotoPointsForm on={row.photo_points} />
            </div>
          )}
        </Section>

        <Section title="Devices">
          <p className="text-sm text-muted">Phones that record and upload your location.</p>
          <a
            href="/devices"
            className="mt-3 inline-block rounded-lg border border-border px-4 py-2 text-sm hover:border-primary/60"
          >
            Manage devices
          </a>
        </Section>

        <Section title="Your data">
          <p className="text-sm text-muted">
            Download every recorded point. Visits and trips are recomputed from these.
          </p>
          <div className="mt-3 flex gap-3">
            <a href="/api/export?format=csv" className="rounded-lg border border-border px-4 py-2 text-sm hover:border-primary/60">
              CSV
            </a>
            <a href="/api/export?format=geojson" className="rounded-lg border border-border px-4 py-2 text-sm hover:border-primary/60">
              GeoJSON
            </a>
          </div>
        </Section>

        <Section title="Sessions">
          <p className="text-sm text-muted">
            You are signed in on {sessions} {Number(sessions) === 1 ? "browser" : "browsers"}.
          </p>
          {Number(sessions) > 1 && (
            <form action={signOutOthers} className="mt-3">
              <button className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:border-red-500 hover:text-red-500">
                Sign out everywhere else
              </button>
            </form>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mk-card p-5">
      <h2 className="mb-4 font-medium">{title}</h2>
      {children}
    </section>
  );
}
