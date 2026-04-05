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
  start_at: string;
  opponent: string;
  note: string | null;
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

  const [{ data: team }, { data: practiceDays }, { data: matches }] = await Promise.all([
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
      .select("id, start_at, opponent, note")
      .eq("team_id", claims.teamId)
      .gte("start_at", new Date().toISOString())
      .lte("start_at", addDays(new Date(), FEED_WINDOW_DAYS).toISOString())
      .order("start_at", { ascending: true }),
  ]);

  const teamRow = team as TeamRow | null;
  if (!teamRow) {
    return new NextResponse("Team not found", { status: 404 });
  }

  const timezone = teamRow.timezone || "Europe/Copenhagen";
  const today = startOfDay(new Date());
  const endDate = addDays(today, FEED_WINDOW_DAYS);

  const practiceEvents = buildPracticeEvents(
    claims.teamId,
    (practiceDays ?? []) as PracticeDayRow[],
    today,
    endDate,
    timezone
  );

  const matchEvents = ((matches ?? []) as MatchRow[]).map((match) => {
    const start = new Date(match.start_at);
    const end = new Date(start.getTime() + MATCH_DURATION_MINUTES * 60 * 1000);

    return {
      uid: `match-${match.id}@xocalendar`,
      summary: match.opponent ? `Match vs ${match.opponent}` : "Team Match",
      description: match.note ?? "",
      start: toIcsUtcDateTime(start),
      end: toIcsUtcDateTime(end),
      useUtc: true,
    } satisfies IcsEvent;
  });

  const calendar = buildIcsCalendar({
    name: `${teamRow.name} - XO Calendar`,
    timezone,
    events: [...practiceEvents, ...matchEvents],
  });

  return new NextResponse(calendar, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": 'inline; filename="xocalendar.ics"',
    },
  });
}

function buildPracticeEvents(
  teamId: string,
  practiceDays: PracticeDayRow[],
  startDate: Date,
  endDate: Date,
  timezone: string
) {
  const events: IcsEvent[] = [];

  for (const day of practiceDays) {
    const dates = datesForWeekday(startDate, endDate, day.weekday);
    const startClock = day.start_time.slice(0, 8);
    const endClock = day.end_time.slice(0, 8);

    for (const date of dates) {
      const dateKey = format(date, "yyyyMMdd");
      events.push({
        uid: `practice-${teamId}-${dateKey}@xocalendar`,
        summary: "Team Practice",
        description: "Scheduled from XO Calendar practice windows.",
        start: `${dateKey}T${clockToIcsTime(startClock)}`,
        end: `${dateKey}T${clockToIcsTime(endClock)}`,
        timezone,
      });
    }
  }

  return events;
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
  return `${lines.join("\r\n")}\r\n`;
}
