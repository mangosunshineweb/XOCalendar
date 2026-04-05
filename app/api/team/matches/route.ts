import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type MatchPayload = {
  teamId?: string;
  matchDate?: string;
  startAt?: string;
  opponent?: string;
  note?: string | null;
};

type UpdateMatchPayload = {
  id?: string;
  matchDate?: string;
  startAt?: string;
  opponent?: string;
  note?: string | null;
};

type DeleteMatchPayload = {
  id?: string;
};

const COPENHAGEN_TIME_ZONE = "Europe/Copenhagen";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function extractTime(value: string) {
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? null;
}

function getTimeZoneOffsetMs(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcMs));

  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  const year = Number(valueByType.year);
  const month = Number(valueByType.month);
  const day = Number(valueByType.day);
  const hour = Number(valueByType.hour);
  const minute = Number(valueByType.minute);
  const second = Number(valueByType.second);

  if ([year, month, day, hour, minute, second].some(Number.isNaN)) {
    throw new Error("Could not resolve timezone offset");
  }

  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtcMs - utcMs;
}

function copenhagenLocalToUtcIso(localDate: string, localTime: string) {
  if (!DATE_PATTERN.test(localDate) || !TIME_PATTERN.test(localTime)) {
    return null;
  }

  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);

  if ([year, month, day, hour, minute].some(Number.isNaN)) {
    return null;
  }

  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMs = naiveUtcMs - getTimeZoneOffsetMs(naiveUtcMs, COPENHAGEN_TIME_ZONE);

  // Recalculate once because DST offset can differ around transitions.
  utcMs = naiveUtcMs - getTimeZoneOffsetMs(utcMs, COPENHAGEN_TIME_ZONE);

  return new Date(utcMs).toISOString();
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as MatchPayload;

  if (!body.teamId || !body.matchDate || !body.startAt) {
    return NextResponse.json(
      { error: "teamId, matchDate, and startAt are required" },
      { status: 400 }
    );
  }

  const startTime = extractTime(body.startAt);
  const startAtUtc = startTime
    ? copenhagenLocalToUtcIso(body.matchDate, startTime)
    : null;

  if (!startAtUtc) {
    return NextResponse.json(
      { error: "Invalid matchDate/startAt format. Expected YYYY-MM-DD and HH:mm." },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("team_matches").insert({
    team_id: body.teamId,
    created_by: user.id,
    match_date: body.matchDate,
    start_at: startAtUtc,
    opponent: body.opponent?.trim() || "TBD",
    note: body.note ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as UpdateMatchPayload;

  if (!body.id || !body.matchDate || !body.startAt) {
    return NextResponse.json(
      { error: "id, matchDate, and startAt are required" },
      { status: 400 }
    );
  }

  const startTime = extractTime(body.startAt);
  const startAtUtc = startTime
    ? copenhagenLocalToUtcIso(body.matchDate, startTime)
    : null;

  if (!startAtUtc) {
    return NextResponse.json(
      { error: "Invalid matchDate/startAt format. Expected YYYY-MM-DD and HH:mm." },
      { status: 400 }
    );
  }

  const { data: match } = await supabase
    .from("team_matches")
    .select("team_id")
    .eq("id", body.id)
    .single();

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", match.team_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("team_matches")
    .update({
      match_date: body.matchDate,
      start_at: startAtUtc,
      opponent: body.opponent?.trim() || "TBD",
      note: body.note ?? null,
    })
    .eq("id", body.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as DeleteMatchPayload;

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data: match } = await supabase
    .from("team_matches")
    .select("team_id")
    .eq("id", body.id)
    .single();

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", match.team_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("team_matches")
    .delete()
    .eq("id", body.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
