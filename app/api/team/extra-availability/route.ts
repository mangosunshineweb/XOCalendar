import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ExtraAvailabilityBody = {
  teamId: string;
  availableDate: string;
  startAt: string;
  endAt: string;
  note?: string | null;
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ExtraAvailabilityBody;

  const { teamId, availableDate, startAt, endAt, note } = body;

  if (!teamId || !availableDate || !startAt || !endAt) {
    return NextResponse.json(
      { error: "teamId, availableDate, startAt, and endAt are required" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("extra_availability").insert({
    team_id: teamId,
    user_id: user.id,
    available_date: availableDate,
    start_at: startAt,
    end_at: endAt,
    note: note ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
