import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Attendee = {
  email: string;
  displayName?: string;
  optional?: boolean;
};

type CreateEventBody = {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
  attendees?: Attendee[];
};

type GoogleEventResponse = {
  id?: string;
  htmlLink?: string;
  error?: { message?: string };
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CreateEventBody;

  const {
    summary,
    description,
    startDateTime,
    endDateTime,
    timeZone,
    attendees,
  } = body;

  if (!summary || !startDateTime || !endDateTime || !timeZone) {
    return NextResponse.json(
      { error: "summary, startDateTime, endDateTime, and timeZone are required" },
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

  const calendarId = connection.calendar_id || "primary";

  const googleRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.provider_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description,
        start: {
          dateTime: startDateTime,
          timeZone,
        },
        end: {
          dateTime: endDateTime,
          timeZone,
        },
        ...(attendees && attendees.length > 0
          ? {
              attendees: attendees.map((a) => ({
                email: a.email,
                displayName: a.displayName,
                optional: a.optional ?? false,
              })),
            }
          : {}),
      }),
    }
  );

  const data = (await googleRes.json()) as GoogleEventResponse;

  if (!googleRes.ok) {
    return NextResponse.json(
      { error: data?.error?.message ?? "Failed to create event" },
      { status: googleRes.status }
    );
  }

  return NextResponse.json({
    ok: true,
    eventId: data.id,
    htmlLink: data.htmlLink,
  });
}
