import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays, format, startOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { buildPracticeWindows } from "@/lib/team/practice-windows";
import { MonthExtraAvailability } from "../../components/month-extra-availability";
import { MonthMatches } from "../../components/month-matches";
import { MonthOverview } from "../../components/month-overview";
import { WeeklyBoard } from "../../components/weekly-board";
import type {
  AvailabilityStatus,
  ExtraAvailabilityRow,
  TeamMatchRow,
  TeamMemberRow,
  WeeklyAvailabilityRow,
} from "@/types/team";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; month?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: initialMembership, error: membershipError } = await supabase
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  let membership = initialMembership;
  let bootstrapError: string | null = null;

  if (!membership) {
    const guessedName =
      typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name
        ? user.user_metadata.full_name
        : user.email?.split("@")[0] ?? "Player";

    const { error: ensureMembershipError } = await supabase.rpc(
      "ensure_user_membership_for_user",
      {
        p_user_id: user.id,
        p_email: user.email ?? null,
        p_full_name: guessedName,
      }
    );

    if (ensureMembershipError && !bootstrapError) {
      bootstrapError = `ensure_membership_rpc: ${ensureMembershipError.message}`;
    }

    const { data: ensuredMembership } = await supabase.rpc(
      "ensure_user_membership_for_user",
      {
        p_user_id: user.id,
        p_email: user.email ?? null,
        p_full_name: guessedName,
      }
    );

    if (ensuredMembership && typeof ensuredMembership === "object") {
      const teamId = (ensuredMembership as { team_id?: string | null }).team_id;
      const role = (ensuredMembership as { role?: string | null }).role;

      if (teamId && role) {
        membership = {
          team_id: teamId,
          role,
        };
      }
    }

    const { data: rpcMembership } = await supabase
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (rpcMembership) {
      membership = rpcMembership;
    }

    if (!membership) {
      const { data: createdMembership } = await supabase
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", user.id)
        .maybeSingle();

      membership = createdMembership;
    }

    if (!membership && !bootstrapError) {
      bootstrapError = "membership_not_created_after_rpc";
    }
  }

  if (!membership) {
    return (
      <main className="space-y-3 p-8">
        <h1 className="text-2xl font-semibold">Setup incomplete</h1>
        <p className="text-sm text-gray-600">
          We could not create your team membership automatically. Please apply
          the latest `supabase/schema.sql` in Supabase SQL Editor, then refresh this page.
        </p>
        <p className="text-sm text-gray-500">Signed in as {user.email ?? "Unknown user"}</p>
        {membershipError ? (
          <pre className="mt-4 rounded bg-red-50 p-3 text-xs text-red-800">
            {JSON.stringify(membershipError, null, 2)}
          </pre>
        ) : bootstrapError ? (
          <pre className="mt-4 rounded bg-red-50 p-3 text-xs text-red-800">
            {bootstrapError}
          </pre>
        ) : (
          <p className="text-xs text-gray-400">No membership error - data was simply null.</p>
        )}
      </main>
    );
  }

  const { week: weekParam, month: monthParam } = await searchParams;

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, timezone")
    .eq("id", membership.team_id)
    .single();

  const { data: defaultDays } = await supabase
    .from("default_practice_days")
    .select("id, weekday, start_time, end_time")
    .eq("team_id", membership.team_id)
    .eq("is_active", true);

  const { data: members } = await supabase
    .from("team_members")
    .select(
      `
      user_id,
      role,
      profiles (
        id,
        display_name
      )
    `
    )
    .eq("team_id", membership.team_id);

  const membersList = (members ?? []) as TeamMemberRow[];
  const playersCount = membersList.length;

  // ── Shared header ────────────────────────────────────────────────────────
  const teamHeaderSection = (
    <section className="rounded-3xl border border-white/35 bg-black p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
            Team Availability Hub
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            {team?.name ?? "CS Team"}
          </h1>
          <p className="mt-2 text-xs font-medium text-white/60 sm:text-sm">
            Signed in as {user.email ?? "Unknown user"}
          </p>
        </div>
        <Link
          href="/profile"
          className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-white/60 px-5 py-2 text-sm font-bold uppercase tracking-widest text-white transition duration-300 hover:-translate-y-0.5 hover:border-white sm:px-6 sm:py-2.5 sm:text-base"
        >
          Profile
          <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">
            -&gt;
          </span>
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/35 bg-black px-3 py-1 text-xs text-white/70">
          {playersCount} players
        </span>
        <span className="rounded-full border border-white/35 bg-black px-3 py-1 text-xs text-white/70">
          {(defaultDays ?? []).length} practice days/week
        </span>
      </div>
    </section>
  );

  // ── WEEK VIEW ─────────────────────────────────────────────────────────────
  if (weekParam) {
    const parsedWeekBase = parseWeekParam(weekParam);
    const weekStart = startOfWeek(parsedWeekBase, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 6);
    const startDate = format(weekStart, "yyyy-MM-dd");
    const endDate = format(weekEnd, "yyyy-MM-dd");
    const weekMidPoint = addDays(weekStart, 3);
    const backMonth = isValidMonthParam(monthParam)
      ? monthParam
      : format(weekMidPoint, "yyyy-MM");

    const windows = buildPracticeWindows(defaultDays ?? [], weekStart);

    const { error: ensureDefaultsError } = await supabase.rpc(
      "ensure_default_availability_for_range",
      {
        p_team_id: membership.team_id,
        p_start_date: startDate,
        p_end_date: endDate,
      }
    );

    if (ensureDefaultsError) {
      console.warn("[availability defaults] week seed failed", ensureDefaultsError);
    }

    const [availData, googleData, weekMatchesData] = await Promise.all([
      supabase
        .from("weekly_availability")
        .select("id, user_id, practice_date, status, note")
        .eq("team_id", membership.team_id)
        .gte("practice_date", startDate)
        .lte("practice_date", endDate),
      supabase
        .from("google_connections")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("team_matches")
        .select("id, team_id, created_by, match_date, start_at, opponent, note, created_at")
        .eq("team_id", membership.team_id)
        .gte("match_date", startDate)
        .lte("match_date", endDate)
        .order("match_date", { ascending: true }),
    ]);

    const availabilityList = (availData.data ?? []) as WeeklyAvailabilityRow[];
    const windowsCount = windows.filter((w) => w.isPracticeDay).length;
    const expectedResponses = windowsCount * playersCount;
    const responsesCount = availabilityList.length;
    const responseRate =
      expectedResponses > 0
        ? Math.round((responsesCount / expectedResponses) * 100)
        : 0;

    const statusTotals = availabilityList.reduce<Record<AvailabilityStatus, number>>(
      (totals, item) => {
        totals[item.status] += 1;
        return totals;
      },
      { available: 0, late: 0, unavailable: 0 }
    );

    const missingCount = Math.max(expectedResponses - responsesCount, 0);

    return (
      <main className="w-full space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10 2xl:px-12">
        {teamHeaderSection}

        {/* Back to Month */}
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard?month=${backMonth}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-black px-4 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white hover:text-black"
          >
            ← Month overview
          </Link>
          <span className="text-sm text-white/50">
            Week of {format(weekStart, "d MMM")} – {format(weekEnd, "d MMM yyyy")}
          </span>
        </div>

      
        {/* Weekly board */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
            Weekly Matrix
          </p>
          <WeeklyBoard
            teamId={membership.team_id}
            currentUserId={user.id}
            windows={windows}
            members={membersList}
            availability={availabilityList}
            googleConnected={Boolean(googleData.data)}
            matches={(weekMatchesData.data ?? []) as TeamMatchRow[]}
          />
        </section>
      </main>
    );
  }

  // ── MONTH VIEW (default) ──────────────────────────────────────────────────
  const todayDate = new Date();
  const todayKey = format(todayDate, "yyyy-MM-dd");
  const currentMonthStr = monthParam ?? format(todayDate, "yyyy-MM");

  // Validate / clamp month string format
  const safeMonth = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(currentMonthStr)
    ? currentMonthStr
    : format(todayDate, "yyyy-MM");

  const [mYear, mMonth] = safeMonth.split("-").map(Number);
  const monthFirstDay = new Date(mYear, mMonth - 1, 1);
  const monthLastDay = new Date(mYear, mMonth, 0);
  const monthStart = format(monthFirstDay, "yyyy-MM-dd");
  const monthEnd = format(monthLastDay, "yyyy-MM-dd");

  const { error: ensureMonthDefaultsError } = await supabase.rpc(
    "ensure_default_availability_for_range",
    {
      p_team_id: membership.team_id,
      p_start_date: monthStart,
      p_end_date: monthEnd,
    }
  );

  if (ensureMonthDefaultsError) {
    console.warn("[availability defaults] month seed failed", ensureMonthDefaultsError);
  }

  const { data: monthAvailability } = await supabase
    .from("weekly_availability")
    .select("practice_date, status")
    .eq("team_id", membership.team_id)
    .gte("practice_date", monthStart)
    .lte("practice_date", monthEnd);

  const { data: monthExtraAvailability } = await supabase
    .from("extra_availability")
    .select(
      `
      id,
      user_id,
      available_date,
      start_at,
      end_at,
      note,
      profiles (
        id,
        display_name
      )
    `
    )
    .eq("team_id", membership.team_id)
    .gte("available_date", monthStart)
    .lte("available_date", monthEnd)
    .order("available_date", { ascending: true });

  const { data: monthMatches, error: matchesError } = await supabase
    .from("team_matches")
    .select("id, team_id, created_by, match_date, start_at, opponent, note, created_at")
    .eq("team_id", membership.team_id)
    .gte("match_date", monthStart)
    .lte("match_date", monthEnd)
    .order("match_date", { ascending: true });

  // DEBUG — remove once matches display is confirmed working
  console.log("[matches debug] team_id:", membership.team_id);
  console.log("[matches debug] range:", monthStart, "→", monthEnd);
  console.log("[matches debug] error:", matchesError);
  console.log("[matches debug] count:", monthMatches?.length, "rows:", JSON.stringify(monthMatches));

  const defaultPracticeWeekdays = (defaultDays ?? []).map((d) => d.weekday);

  return (
    <main className="w-full space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10 2xl:px-12">
      {teamHeaderSection}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="min-w-0">
          <MonthOverview
            currentMonth={safeMonth}
            defaultPracticeWeekdays={defaultPracticeWeekdays}
            availability={(monthAvailability ?? []) as { practice_date: string; status: AvailabilityStatus }[]}
            matches={(monthMatches ?? []) as TeamMatchRow[]}
            totalMembers={playersCount}
            today={todayKey}
          />
        </div>

        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <MonthMatches
            teamId={membership.team_id}
            month={safeMonth}
            today={todayKey}
            matches={(monthMatches ?? []) as TeamMatchRow[]}
          />
        </aside>
      </section>

  


    </main>
  );
}

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <article className="rounded-2xl border border-white/35 bg-black p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-white/60">{subtext}</p>
    </article>
  );
}

function StatusBadge({
  label,
  tone,
  value,
}: {
  label: string;
  tone: AvailabilityStatus;
  value: number;
}) {
  const toneMap: Record<AvailabilityStatus, string> = {
    available: "border-white/35 bg-black text-white",
    late: "border-white/35 bg-black text-white",
    unavailable: "border-white/35 bg-black text-white",
  };

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${toneMap[tone]}`}>
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Safely parse a URL week param (YYYY-MM-DD) into a Date.
 * Falls back to today if the string is malformed or not a valid date.
 */
function parseWeekParam(weekStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStr)) {
    return new Date();
  }
  const parsed = new Date(`${weekStr}T00:00:00`);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isValidMonthParam(monthStr?: string): monthStr is string {
  if (!monthStr) {
    return false;
  }

  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(monthStr);
}
