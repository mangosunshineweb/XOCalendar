import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { calendarId?: unknown };
  const { calendarId } = body;

  if (!calendarId || typeof calendarId !== "string") {
    return NextResponse.json({ error: "Invalid calendarId" }, { status: 400 });
  }

  const { error } = await supabase
    .from("google_connections")
    .update({
      calendar_id: calendarId,
      token_updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
