import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type CreateEventPayload = {
  calendarId?: string;
  summary?: string;
  description?: string;
  startDateTime?: string;
  endDateTime?: string;
  timeZone?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.provider_token;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing Google provider token in session" },
      { status: 401 }
    );
  }

  const body = (await request.json()) as CreateEventPayload;

  if (!body.summary || !body.startDateTime || !body.endDateTime) {
    return NextResponse.json(
      { error: "summary, startDateTime, and endDateTime are required" },
      { status: 400 }
    );
  }

  const calendarId = body.calendarId ?? "primary";
  const timeZone = body.timeZone ?? "UTC";

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: body.summary,
        description: body.description ?? "",
        start: {
          dateTime: body.startDateTime,
          timeZone,
        },
        end: {
          dateTime: body.endDateTime,
          timeZone,
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: "Google event creation failed", details: data },
      { status: response.status }
    );
  }

  return NextResponse.json(data);
}
