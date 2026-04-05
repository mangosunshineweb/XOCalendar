import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type GoogleCalendarListItem = {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  accessRole?: string;
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarListItem[];
  error?: { message?: string };
};

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: connection, error } = await supabase
    .from("google_connections")
    .select("provider_token")
    .eq("user_id", user.id)
    .single();

  if (error || !connection?.provider_token) {
    return NextResponse.json(
      { error: "Google Calendar not connected" },
      { status: 400 }
    );
  }

  const googleRes = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
    {
      headers: {
        Authorization: `Bearer ${connection.provider_token}`,
      },
    }
  );

  const data = (await googleRes.json()) as GoogleCalendarListResponse;

  if (!googleRes.ok) {
    return NextResponse.json(
      { error: data?.error?.message ?? "Failed to fetch calendars" },
      { status: googleRes.status }
    );
  }

  return NextResponse.json({
    items: (data.items ?? []).map((item) => ({
      id: item.id,
      summary: item.summary,
      primary: item.primary ?? false,
      backgroundColor: item.backgroundColor ?? null,
      accessRole: item.accessRole ?? null,
    })),
  });
}
