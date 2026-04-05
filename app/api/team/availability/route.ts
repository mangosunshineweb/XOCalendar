import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AvailabilityStatus = "available" | "late" | "unavailable";

type AvailabilityPayload = {
  teamId?: string;
  practiceDate?: string;
  startAt?: string;
  endAt?: string;
  status?: AvailabilityStatus;
  note?: string | null;
};

function isValidStatus(value: string): value is AvailabilityStatus {
  return value === "available" || value === "late" || value === "unavailable";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as AvailabilityPayload;

  if (
    !body.teamId ||
    !body.practiceDate ||
    !body.startAt ||
    !body.endAt ||
    !body.status ||
    !isValidStatus(body.status)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const rowPayload = {
    team_id: body.teamId,
    user_id: user.id,
    practice_date: body.practiceDate,
    start_at: body.startAt,
    end_at: body.endAt,
    status: body.status,
    note: body.note ?? null,
    source: "manual",
  };

  const { error: upsertError } = await supabase
    .from("weekly_availability")
    .upsert(rowPayload, {
      onConflict: "team_id,user_id,practice_date",
    });

  if (!upsertError) {
    return NextResponse.json({ ok: true });
  }

  // Fallback for environments where the unique constraint was not created yet.
  if (upsertError.code !== "42P10") {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  const { data: existing, error: selectError } = await supabase
    .from("weekly_availability")
    .select("id")
    .eq("team_id", body.teamId)
    .eq("user_id", user.id)
    .eq("practice_date", body.practiceDate)
    .limit(1)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 400 });
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("weekly_availability")
      .update({
        start_at: body.startAt,
        end_at: body.endAt,
        status: body.status,
        note: body.note ?? null,
        source: "manual",
      })
      .eq("id", existing.id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  } else {
    const { error: insertError } = await supabase
      .from("weekly_availability")
      .insert(rowPayload);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
