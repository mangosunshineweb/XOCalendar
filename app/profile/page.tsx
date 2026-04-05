import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { GoogleCalendarSettings } from "@/components/google-calendar-settings";
import { ProfileAccountForm } from "@/components/profile-account-form";
import { SignOutButton } from "@/app/components/sign-out-button";
import { createCalendarFeedToken } from "@/lib/calendar/feed-token";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: connection } = await supabase
    .from("google_connections")
    .select("google_email, calendar_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const teamId = membership?.team_id ?? null;
  const isFeedConfigured = Boolean(
    process.env.CALENDAR_FEED_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const token = teamId
    ? createCalendarFeedToken({
        userId: user.id,
        teamId,
      })
    : null;

  const appOrigin = await getAppOrigin();
  const subscriptionUrl = token && appOrigin ? `${appOrigin}/api/calendar/feed?token=${token}` : null;
  const isLocalSubscriptionUrl = Boolean(subscriptionUrl && isLocalOrigin(subscriptionUrl));
  const subscriptionIssue = !teamId
    ? "Join a team to generate your subscription URL."
    : !isFeedConfigured
      ? "Calendar feed is not configured on the server. Set CALENDAR_FEED_SECRET and reload."
      : !token
        ? "Could not generate a subscription token. Check server feed secret configuration."
        : !appOrigin
          ? "Could not determine app URL. Set NEXT_PUBLIC_SITE_URL and reload."
          : null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-white/35 bg-black p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
              Account
            </p>
            <h1 className="mt-2 text-3xl font-bold">Profile</h1>
            <p className="mt-2 text-sm text-white/70">Manage your profile details and account.</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2 text-sm font-bold uppercase tracking-widest text-white transition duration-300 hover:-translate-y-0.5 hover:border-white sm:px-6 sm:py-2.5 sm:text-base"
            >
              Dashboard
              <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">
                -&gt;
              </span>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </section>

      <ProfileAccountForm
        email={user.email ?? "Unknown user"}
        initialDisplayName={profile?.display_name ?? ""}
      />

      <section className="space-y-4 rounded-3xl border border-white/35 bg-black p-6 text-white">
        <div>
          <h2 className="text-xl font-semibold">Google Calendar Settings</h2>
          <p className="mt-1 text-sm text-white/70">
            Choose which Google Calendar should be used for practice conflict checks.
          </p>
        </div>

        <GoogleCalendarSettings
          googleEmail={connection?.google_email ?? null}
          selectedCalendarId={connection?.calendar_id ?? "primary"}
        />
      </section>

      <section className="space-y-3 rounded-3xl border border-white/35 bg-black p-6 text-white">
        <h2 className="text-xl font-semibold">Calendar Subscription URL</h2>
        <p className="text-sm text-white/70">
          Add this URL in Google Calendar via Other calendars -&gt; Add by URL to keep your calendar synced with app updates.
        </p>
        {subscriptionUrl ? (
          <>
            <input
              readOnly
              value={subscriptionUrl}
              className="w-full rounded-lg border border-white/35 bg-black px-3 py-2 text-xs text-white"
            />
            {isLocalSubscriptionUrl ? (
              <p className="text-xs text-amber-300">
                This URL is localhost. Google Calendar cannot fetch localhost feeds. Use a public HTTPS URL via deployment or tunnel, then copy the new link.
              </p>
            ) : null}
            <p className="text-xs text-white/60">
              Google refreshes subscribed URLs periodically, so updates can take some time to appear.
            </p>
          </>
        ) : (
          <p className="text-sm text-white/70">{subscriptionIssue ?? "Subscription URL is currently unavailable."}</p>
        )}
      </section>
    </main>
  );
}

async function getAppOrigin() {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (configuredOrigin) {
    return configuredOrigin.replace(/\/$/, "");
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  return host ? `${protocol}://${host}` : "";
}

function isLocalOrigin(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}