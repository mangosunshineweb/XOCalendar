import { NextResponse } from "next/server";
import { addDays, format, startOfDay } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCalendarFeedToken } from "@/lib/calendar/feed-token";

type TeamRow = {
  name: string;
  timezone: string;
};

type PracticeDayRow = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

type MatchRow = {
  id: string;
  match_date: string;
  start_at: string;
  opponent: string;
  note: string | null;
};

type AvailabilityCount = {
  yes: number;
  late: number;
  no: number;
  responded: number;
};

type IcsEvent = {
  uid: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  useUtc?: boolean;
  timezone?: string;
};

const FEED_WINDOW_DAYS = 180;
const MATCH_DURATION_MINUTES = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return new NextResponse("Missing token", { status: 401 });
  }

  const claims = verifyCalendarFeedToken(token);
  if (!claims) {
    return new NextResponse("Invalid token", { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("Calendar feed is not configured", { status: 500 });
  }

  const { data: membership, error: membershipError } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", claims.userId)
    .eq("team_id", claims.teamId)
    .maybeSingle();

  if (membershipError || !membership) {
    return new NextResponse("Feed not found", { status: 404 });
  }

  const [{ data: team }, { data: practiceDays }, { data: matches }, { data: teamMembers }] = await Promise.all([
    admin
      .from("teams")
      .select("name, timezone")
      .eq("id", claims.teamId)
      .single(),
    admin
      .from("default_practice_days")
      .select("id, weekday, start_time, end_time")
      .eq("team_id", claims.teamId)
      .eq("is_active", true),
    admin
      .from("team_matches")
      .select("id, match_date, start_at, opponent, note")
      .eq("team_id", claims.teamId)
      .gte("start_at", new Date().toISOString())
      .lte("start_at", addDays(new Date(), FEED_WINDOW_DAYS).toISOString())
      .order("start_at", { ascending: true }),
    admin
      .from("team_members")
      .select("user_id")
      .eq("team_id", claims.teamId),
  ]);

  const teamRow = team as TeamRow | null;
  if (!teamRow) {
    return new NextResponse("Team not found", { status: 404 });
  }

  const timezone = teamRow.timezone || "Europe/Copenhagen";
  const today = startOfDay(new Date());
  const endDate = addDays(today, FEED_WINDOW_DAYS);
  const startDateKey = format(today, "yyyy-MM-dd");
  const endDateKey = format(endDate, "yyyy-MM-dd");
  const totalMembers = (teamMembers ?? []).length;

  const practiceWeekdaySet = new Set(
    ((practiceDays ?? []) as PracticeDayRow[]).map((day) => day.weekday)
  );

  const availabilityByDate = await loadAvailabilityCountsByDate(
    admin,
    claims.teamId,
    startDateKey,
    endDateKey
  );

  const practiceEvents = await buildPracticeEvents(
    claims.teamId,
    (practiceDays ?? []) as PracticeDayRow[],
    today,
    endDate,
    timezone,
    totalMembers,
    availabilityByDate
  );

  const matchEvents = await buildMatchEvents(
    (matches ?? []) as MatchRow[],
    totalMembers,
    availabilityByDate,
    practiceWeekdaySet
  );

  const calendar = buildIcsCalendar({
    name: `${teamRow.name} - XO Calendar`,
    timezone,
    events: [...practiceEvents, ...matchEvents],
  });

  return new NextResponse(calendar, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Disposition": 'inline; filename="xocalendar.ics"',
    },
  });
}

async function buildPracticeEvents(
  teamId: string,
  practiceDays: PracticeDayRow[],
  startDate: Date,
  endDate: Date,
  timezone: string,
  totalMembers: number,
  availabilityByDate: Map<string, AvailabilityCount>
) {
  const events: IcsEvent[] = [];

  for (const day of practiceDays) {
    const dates = datesForWeekday(startDate, endDate, day.weekday);
    const startClock = day.start_time.slice(0, 8);
    const endClock = day.end_time.slice(0, 8);

    for (const date of dates) {
      const dateKey = format(date, "yyyyMMdd");
      const dateStr = format(date, "yyyy-MM-dd");

      const counts = availabilityByDate.get(dateStr) ?? emptyAvailabilityCount();
      const yesCount = totalMembers - counts.late - counts.no;
      const lateCount = counts.late;
      const noCount = counts.no;
      const attendanceLine = `Yes: ${yesCount} | Late: ${lateCount} | No: ${noCount}`;
      const description = `${attendanceLine}\n\nScheduled from XO Calendar.`;
      const compactCounts = `Y:${yesCount} L:${lateCount} N:${noCount}`;

      events.push({
        uid: `practice-${teamId}-${dateKey}@xocalendar`,
        summary: `${compactCounts} - Team Practice`,
        description: description,
        start: `${dateKey}T${clockToIcsTime(startClock)}`,
        end: `${dateKey}T${clockToIcsTime(endClock)}`,
        timezone,
      });
    }
  }

  return events;
}

async function buildMatchEvents(
  matches: MatchRow[],
  totalMembers: number,
  availabilityByDate: Map<string, AvailabilityCount>,
  practiceWeekdaySet: Set<number>
) {
  const events: IcsEvent[] = [];

  for (const match of matches) {
    const start = new Date(match.start_at);
    const end = new Date(start.getTime() + MATCH_DURATION_MINUTES * 60 * 1000);
    const dateStr = normalizeDateKey(match.match_date);
    const counts = availabilityByDate.get(dateStr) ?? emptyAvailabilityCount();
    const hasImplicitDefaultYes = practiceWeekdaySet.has(start.getDay());
    const yesCount = hasImplicitDefaultYes
      ? totalMembers - counts.late - counts.no
      : counts.yes;
    const lateCount = counts.late;
    const noCount = counts.no;

    const attendanceLine = `Yes: ${yesCount} | Late: ${lateCount} | No: ${noCount}`;
    const baseDescription = match.note ? `${match.note}\n\n` : "";
    const description = `${baseDescription}${attendanceLine}`;
    const compactCounts = `Y:${yesCount} L:${lateCount} N:${noCount}`;
    const matchTitle = match.opponent ? `Match vs ${match.opponent}` : "Team Match";

    events.push({
      uid: `match-${match.id}@xocalendar`,
      summary: `${compactCounts} - ${matchTitle}`,
      description: description,
      start: toIcsUtcDateTime(start),
      end: toIcsUtcDateTime(end),
      useUtc: true,
    } satisfies IcsEvent);
  }

  return events;
}

async function loadAvailabilityCountsByDate(
  admin: any,
  teamId: string,
  startDate: string,
  endDate: string
) {
  const { data } = await admin
    .from("weekly_availability")
    .select("practice_date, status")
    .eq("team_id", teamId)
    .gte("practice_date", startDate)
    .lte("practice_date", endDate);

  const countsByDate = new Map<string, AvailabilityCount>();

  for (const row of (data ?? []) as { practice_date: string; status: string }[]) {
    const dateKey = normalizeDateKey(row.practice_date);
    const counts = countsByDate.get(dateKey) ?? emptyAvailabilityCount();

    if (row.status === "available") {
      counts.yes += 1;
    } else if (row.status === "late") {
      counts.late += 1;
    } else if (row.status === "unavailable") {
      counts.no += 1;
    }

    counts.responded = counts.yes + counts.late + counts.no;
    countsByDate.set(dateKey, counts);
  }

  return countsByDate;
}

function emptyAvailabilityCount(): AvailabilityCount {
  return {
    yes: 0,
    late: 0,
    no: 0,
    responded: 0,
  };
}

function normalizeDateKey(value: string) {
  return value.slice(0, 10);
}

function datesForWeekday(startDate: Date, endDate: Date, weekday: number) {
  const dates: Date[] = [];

  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= endDate) {
    if (cursor.getDay() === weekday) {
      dates.push(new Date(cursor));
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function clockToIcsTime(clock: string) {
  const compact = clock.replaceAll(":", "").slice(0, 6);
  return compact.padEnd(6, "0");
}

function toIcsUtcDateTime(value: Date) {
  return `${value.getUTCFullYear()}${pad2(value.getUTCMonth() + 1)}${pad2(value.getUTCDate())}T${pad2(value.getUTCHours())}${pad2(value.getUTCMinutes())}${pad2(value.getUTCSeconds())}Z`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function escapeIcsText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n");
}

// RFC 5545 §3.1: fold lines longer than 75 octets
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  let result = "";
  let chunk = "";
  for (const char of line) {
    const candidate = chunk + char;
    if (encoder.encode(candidate).length > (result === "" ? 75 : 74)) {
      result += (result === "" ? "" : "\r\n ") + chunk;
      chunk = char;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) result += (result === "" ? "" : "\r\n ") + chunk;
  return result;
}

function buildIcsCalendar({
  name,
  timezone,
  events,
}: {
  name: string;
  timezone: string;
  events: IcsEvent[];
}) {
  const nowStamp = toIcsUtcDateTime(new Date());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//XO Calendar//Team Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(name)}`,
    `X-WR-TIMEZONE:${escapeIcsText(timezone)}`,
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);

    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    }

    if (event.useUtc) {
      lines.push(`DTSTART:${event.start}`);
      lines.push(`DTEND:${event.end}`);
    } else {
      const eventTimezone = event.timezone || timezone;
      lines.push(`DTSTART;TZID=${eventTimezone}:${event.start}`);
      lines.push(`DTEND;TZID=${eventTimezone}:${event.end}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
