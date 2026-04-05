"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExtraAvailabilityRow } from "@/types/team";

type Props = {
  teamId: string;
  month: string; // YYYY-MM
  today: string; // YYYY-MM-DD
  extraAvailability: ExtraAvailabilityRow[];
};

const EXTRA_DEFAULT_START = "19:00";
const EXTRA_DEFAULT_END = "22:00";

export function MonthExtraAvailability({
  teamId,
  month,
  today,
  extraAvailability,
}: Props) {
  const router = useRouter();
  const [extraDate, setExtraDate] = useState(getInitialDate(month, today));
  const [extraStartTime, setExtraStartTime] = useState(EXTRA_DEFAULT_START);
  const [extraEndTime, setExtraEndTime] = useState(EXTRA_DEFAULT_END);
  const [extraNote, setExtraNote] = useState("");
  const [extraSaving, setExtraSaving] = useState(false);
  const [extraMessage, setExtraMessage] = useState<string | null>(null);
  const extraDateInputRef = useRef<HTMLInputElement | null>(null);

  const sortedAvailability = useMemo(
    () => [...extraAvailability].sort((a, b) => a.available_date.localeCompare(b.available_date)),
    [extraAvailability]
  );

  const minDate = today;

  const addExtraAvailability = async () => {
    if (!extraDate) {
      setExtraMessage("Choose a date first");
      return;
    }

    if (extraDate < minDate) {
      setExtraMessage("Please choose today or a future date");
      return;
    }

    if (!isValidTimeRange(extraStartTime, extraEndTime)) {
      setExtraMessage("End time must be later than start time");
      return;
    }

    setExtraSaving(true);
    setExtraMessage(null);

    const startAt = `${extraDate}T${extraStartTime}:00`;
    const endAt = `${extraDate}T${extraEndTime}:00`;

    const res = await fetch("/api/team/extra-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        availableDate: extraDate,
        startAt,
        endAt,
        note: extraNote || null,
      }),
    });

    const data = (await res.json()) as { ok?: boolean; error?: string };

    if (res.ok) {
      setExtraMessage("Extra day added");
      setExtraStartTime(EXTRA_DEFAULT_START);
      setExtraEndTime(EXTRA_DEFAULT_END);
      setExtraNote("");
      router.refresh();
    } else {
      setExtraMessage(data.error ?? "Failed to add extra day");
    }

    setExtraSaving(false);
  };

  const openExactDatePicker = () => {
    const input = extraDateInputRef.current;
    if (!input) {
      return;
    }

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.focus();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/35 bg-black p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Add Extra Available Day</h3>
            <p className="mt-1 text-sm text-white/70">
              Add scrims, VOD reviews, or makeup practice from the month view.
            </p>
          </div>
          <span className="rounded-full border border-white/35 px-3 py-1 text-xs text-white/70">
            Step 1: Date • Step 2: Time • Step 3: Save
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <button
            type="button"
            onClick={openExactDatePicker}
            className="group relative rounded-lg border border-white/35 bg-black px-3 py-2 text-left outline-none ring-white/40 transition hover:bg-white hover:text-black focus:ring md:col-span-1"
          >
            <span className="block text-xs text-white/60 transition group-hover:text-black/70">Date</span>
            <span className="mt-1 block text-sm text-white transition group-hover:text-black">
              {extraDate || "Select date"}
            </span>
            <input
              ref={extraDateInputRef}
              type="date"
              min={minDate}
              value={extraDate}
              onChange={(e) => setExtraDate(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </button>

          <input
            type="time"
            value={extraStartTime}
            onChange={(e) => setExtraStartTime(e.target.value)}
            className="rounded-lg border border-white/35 bg-black px-3 py-2 text-sm text-white outline-none ring-white/40 focus:ring"
          />

          <input
            type="time"
            value={extraEndTime}
            onChange={(e) => setExtraEndTime(e.target.value)}
            className="rounded-lg border border-white/35 bg-black px-3 py-2 text-sm text-white outline-none ring-white/40 focus:ring"
          />

          <input
            type="text"
            value={extraNote}
            onChange={(e) => setExtraNote(e.target.value)}
            placeholder="Optional note (scrim, VOD, etc.)"
            className="rounded-lg border border-white/35 bg-black px-3 py-2 text-sm text-white outline-none ring-white/40 focus:ring"
          />
        </div>

        <p className="mt-3 text-xs text-white/60">
          Preview: {extraDate || "No date"} • {extraStartTime} - {extraEndTime}
        </p>

        <button
          type="button"
          onClick={() => void addExtraAvailability()}
          disabled={extraSaving}
          className="mt-4 rounded-lg border border-white/35 bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {extraSaving ? "Saving..." : "Add extra day"}
        </button>

        {extraMessage ? <p className="mt-3 text-sm text-white/70">{extraMessage}</p> : null}
      </section>

      <section className="rounded-2xl border border-white/35 bg-black p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-white">Extra Availability This Month</h3>

        <div className="mt-4 space-y-3">
          {sortedAvailability.length === 0 ? (
            <p className="text-sm text-white/65">No extra days added yet.</p>
          ) : (
            sortedAvailability.map((item) => {
              const profile = Array.isArray(item.profiles)
                ? item.profiles[0] ?? null
                : item.profiles;

              const playerName = profile?.display_name ?? "Player";

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/25 bg-black p-4 text-sm"
                >
                  <div className="font-medium text-white">{playerName}</div>
                  <div className="mt-1 text-white/75">
                    {item.available_date} ·{" "}
                    {new Date(item.start_at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    -
                    {new Date(item.end_at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {item.note ? <div className="mt-1 text-white/60">{item.note}</div> : null}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function isValidTimeRange(startTime: string, endTime: string) {
  return toMinutes(endTime) > toMinutes(startTime);
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  return hours * 60 + minutes;
}

function getInitialDate(month: string, today: string) {
  const monthStart = `${month}-01`;
  return today > monthStart ? today : monthStart;
}
