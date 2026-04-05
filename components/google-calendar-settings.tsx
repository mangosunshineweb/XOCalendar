"use client";

import { useEffect, useState } from "react";

type CalendarItem = {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor: string | null;
  accessRole: string | null;
};

type CalendarsResponse = {
  items?: CalendarItem[];
  error?: string;
};

type SaveResponse = {
  ok?: boolean;
  error?: string;
};

export function GoogleCalendarSettings({
  googleEmail,
  selectedCalendarId,
}: {
  googleEmail: string | null;
  selectedCalendarId: string;
}) {
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [currentCalendarId, setCurrentCalendarId] =
    useState(selectedCalendarId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadCalendars = async () => {
      const res = await fetch("/api/google/calendars");
      const data = (await res.json()) as CalendarsResponse;

      if (res.ok) {
        setCalendars(data.items ?? []);
      } else {
        setMessage(data.error ?? "Failed to load calendars");
      }

      setLoading(false);
    };

    void loadCalendars();
  }, []);

  const saveSelection = async () => {
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/google/calendar-selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId: currentCalendarId }),
    });

    const data = (await res.json()) as SaveResponse;

    if (res.ok) {
      setMessage("Calendar saved");
    } else {
      setMessage(data.error ?? "Failed to save calendar");
    }

    setSaving(false);
  };

  return (
    <section className="space-y-4 rounded-xl border p-6">
      <div>
        <h2 className="text-xl font-semibold">Google Calendar</h2>
        <p className="mt-1 text-sm text-gray-600">
          Connected account: {googleEmail ?? "Not connected"}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading calendars...</p>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-medium">Calendar</label>

          <select
            value={currentCalendarId}
            onChange={(e) => setCurrentCalendarId(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          >
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.summary}
                {calendar.primary ? " (Primary)" : ""}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void saveSelection()}
            disabled={saving}
            className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save calendar"}
          </button>

          {message ? <p className="text-sm text-gray-600">{message}</p> : null}
        </div>
      )}
    </section>
  );
}
