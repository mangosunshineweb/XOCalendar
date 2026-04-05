import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type FreeBusyPayload = {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  timeZone?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as FreeBusyPayload;

  if (!body.timeMin || !body.timeMax) {
    return NextResponse.json(
      { error: "timeMin and timeMax are required" },
      { status: 400 }
    );
  }

  const { data: connection, error: connectionError } = await supabase
    .from("google_connections")
    .select("calendar_id, provider_token")
    .eq("user_id", user.id)
    .single();

  if (connectionError || !connection?.provider_token) {
    return NextResponse.json(
      { error: "Google Calendar not connected" },
      { status: 400 }
    );
  }

  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.provider_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: body.timeMin,
      timeMax: body.timeMax,
      timeZone: body.timeZone ?? "UTC",
      items: [{ id: body.calendarId || connection.calendar_id || "primary" }],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data?.error?.message || "Google FreeBusy failed" },
      { status: response.status }
    );
  }

  return NextResponse.json(data);
}
