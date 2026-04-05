"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AvailabilityStatus, TeamMatchRow } from "@/types/team";

type MonthMatch = {
  id: string;
  startAt: string;
  opponent: string;
};

type DayData = {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPracticeDay: boolean;
  available: number;
  late: number;
  unavailable: number;
  matches: MonthMatch[];
};

type WeekData = {
  weekStart: string; // YYYY-MM-DD (always the Monday)
  days: DayData[]; // 7 days: Mon → Sun
};

type Props = {
  currentMonth: string; // "YYYY-MM"
  defaultPracticeWeekdays: number[]; // weekday numbers: 0=Sun, 1=Mon, … 6=Sat
  availability: { practice_date: string; status: AvailabilityStatus }[];
  matches: TeamMatchRow[];
  totalMembers: number;
  today: string; // YYYY-MM-DD
};

const COPENHAGEN_TIME_ZONE = "Europe/Copenhagen";

export function MonthOverview({
  currentMonth,
  defaultPracticeWeekdays,
  availability,
  matches,
  totalMembers,
  today,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [year, month] = currentMonth.split("-").map(Number);

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const prevMonth =
    month === 1
      ? `${year - 1}-12`
      : `${year}-${String(month - 1).padStart(2, "0")}`;

  const nextMonth =
    month === 12
      ? `${year + 1}-01`
      : `${year}-${String(month + 1).padStart(2, "0")}`;

  const practiceWeekdaySet = new Set(defaultPracticeWeekdays);
  const weeks = buildMonthWeeks(
    currentMonth,
    today,
    practiceWeekdaySet,
    availability,
    matches,
    totalMembers
  );

  const handleWeekClick = (weekStart: string) => {
    startTransition(() => {
      router.push(`/dashboard?week=${weekStart}&month=${currentMonth}`);
    });
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-white/35 bg-black">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/20 px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
            Month Overview
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">{monthLabel}</h2>
          <p className="mt-1 text-sm text-white/60">
            Click any week row to view and update availability for that week.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => router.push(`/dashboard?month=${prevMonth}`))}
            className="rounded-md border border-white/35 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white hover:text-black"
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => router.push(`/dashboard?month=${nextMonth}`))}
            className="rounded-md border border-white/35 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white hover:text-black"
          >
            Next →
          </button>
        </div>
      </div>
      {/* Grid area — loading overlay wrapper */}
      <div className="relative">
        {isPending ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
            <svg
              className="h-8 w-8 animate-spin text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        ) : null}

        {/* Weekday column headers */}
        <div className="grid grid-cols-7 border-b border-white/15">
{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-widest text-white/50"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Week rows — each is clickable */}
      {weeks.map((week, weekIndex) => {
        const hasCurrentMonthDay = week.days.some((d) => d.isCurrentMonth);
        if (!hasCurrentMonthDay) return null;
        const weekNumber = getIsoWeekNumber(week.weekStart);

        const hasPracticeDay = week.days.some((d) => d.isPracticeDay && d.isCurrentMonth);
        const hasMatchDay = week.days.some((d) => d.matches.length > 0 && d.isCurrentMonth);

        return (
          <button
            key={week.weekStart}
            type="button"
            onClick={() => handleWeekClick(week.weekStart)}
            className={`group grid w-full grid-cols-7 text-left transition hover:bg-white/5 ${
              weekIndex < weeks.length - 1 ? "border-b border-white/10" : ""
            }`}
          >
            {week.days.map((day) => {
              const isPracticeInMonth = day.isPracticeDay && day.isCurrentMonth;
              const hasNo = isPracticeInMonth && day.unavailable > 0;
              const hasLate = isPracticeInMonth && day.late > 0;
              const isAllYes =
                isPracticeInMonth &&
                totalMembers > 0 &&
                day.available === totalMembers;

              const dayToneClass = hasNo
                ? "border-red-300/60 bg-red-500/30"
                : hasLate
                  ? "border-amber-300/60 bg-amber-500/30"
                  : isAllYes
                    ? "border-emerald-300/60 bg-emerald-500/30"
                    : isPracticeInMonth
                      ? "border-white/10 bg-white/2"
                      : "border-white/10";

              const pillToneClass = hasNo
                ? "border border-red-200/80 bg-red-500/35 text-red-50"
                : hasLate
                  ? "border border-amber-200/80 bg-amber-500/35 text-amber-50"
                  : isAllYes
                    ? "border border-emerald-200/80 bg-emerald-500/35 text-emerald-50"
                    : "border border-white/25 text-white/70";

              const lineToneClass = hasNo
                ? "text-red-50"
                : hasLate
                  ? "text-amber-50"
                  : isAllYes
                    ? "text-emerald-50"
                    : "text-white/60";

              const dotToneClass = hasNo
                ? "bg-red-100"
                : hasLate
                  ? "bg-amber-100"
                  : isAllYes
                    ? "bg-emerald-100"
                    : "bg-white/60";

              const statusLabel = hasNo
                ? "NO"
                : hasLate
                  ? "LATE"
                  : isAllYes
                    ? "ALL YES"
                    : null;

              return (
              <div
                key={day.date}
                className={`relative h-32 border-r p-2.5 last:border-r-0 ${
                  !day.isCurrentMonth ? "opacity-25" : ""
                } ${dayToneClass}`}
              >
                {day.date === week.weekStart ? (
                  <span className="absolute right-2 top-2 rounded-full border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                    {weekNumber}
                  </span>
                ) : null}

                {/* Day number */}
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                    day.isToday
                      ? "bg-white text-black"
                      : "text-white/85"
                  }`}
                >
                  {day.dayNumber}
                </span>

                {day.isCurrentMonth && day.matches.length > 0 ? (
                  <div className="mt-1">
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-white/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300"
                      title={
                        day.matches[0].opponent && day.matches[0].opponent !== "TBD"
                          ? `vs ${day.matches[0].opponent}`
                          : "Scheduled match"
                      }
                    >
                      Match {day.matches.length > 1 ? `(${day.matches.length})` : ""} · {formatMatchTime(day.matches[0].startAt)}
                    </span>
                  </div>
                ) : null}

                {/* Practice day indicators */}
                {day.isPracticeDay && day.isCurrentMonth ? (
                  <div className="mt-1.5 space-y-1">
                    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pillToneClass}`}>
                      {statusLabel ? `Practice · ${statusLabel}` : "Practice"}
                    </span>
                    <div className={`flex items-center gap-1.5 text-[11px] ${lineToneClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dotToneClass}`} />
                      {day.available}/{totalMembers} in
                    </div>
                  </div>
                ) : null}
              </div>
              );
            })}

            {/* Hover "view week" affordance — visually subtle */}
            {hasPracticeDay || hasMatchDay ? (
              <div className="col-span-7 flex items-center justify-end px-3 opacity-0 transition group-hover:opacity-100">
               
              </div>
            ) : null}
          </button>
        );
      })}

      </div>{/* end grid overlay wrapper */}

      {/* Legend */}
      <div className="flex items-center gap-4 border-t border-white/10 px-6 py-3">
        <div className="flex items-center gap-1.5 text-[11px] text-white/45">
          <span className="inline-flex p-2 items-center justify-center rounded-full border border-white/20 text-[10px]">
            Practice
          </span>
          <span>= default practice day</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-white/45">
          <span className="inline-flex p-2 items-center justify-center rounded-full border border-white/20 text-[10px]">
            Match
          </span>
          <span>= scheduled match day</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-white/45">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black">
            1
          </span>
          <span>= today</span>
        </div>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeekMonday(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  result.setDate(result.getDate() + diff);
  return result;
}

function addDaysLocal(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function buildMonthWeeks(
  currentMonth: string,
  today: string,
  practiceWeekdaySet: Set<number>,
  availability: { practice_date: string; status: AvailabilityStatus }[],
  matches: TeamMatchRow[],
  totalMembers: number
): WeekData[] {
  const [year, month] = currentMonth.split("-").map(Number);
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const lastDayOfMonth = new Date(year, month, 0);

  // Group availability by date
  const availByDate = new Map<
    string,
    { late: number; unavailable: number }
  >();
  for (const item of availability) {
    const practiceDateKey = normalizeDateKey(item.practice_date);
    const existing = availByDate.get(practiceDateKey) ?? {
      late: 0,
      unavailable: 0,
    };
    if (item.status === "late") existing.late += 1;
    if (item.status === "unavailable") existing.unavailable += 1;
    availByDate.set(practiceDateKey, existing);
  }

  const matchesByDate = new Map<string, MonthMatch[]>();
  for (const match of matches) {
    const matchDateKey = normalizeDateKey(match.match_date);
    const entries = matchesByDate.get(matchDateKey) ?? [];
    entries.push({
      id: match.id,
      startAt: match.start_at,
      opponent: match.opponent,
    });
    matchesByDate.set(matchDateKey, entries);
  }

  for (const entries of matchesByDate.values()) {
    entries.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  const calendarStart = startOfWeekMonday(firstDayOfMonth);
  const weeks: WeekData[] = [];
  let weekStart = new Date(calendarStart);

  // Generate weeks until we've passed the last day of the month
  while (weekStart <= lastDayOfMonth) {
    const days: DayData[] = [];

    for (let i = 0; i < 7; i++) {
      const date = addDaysLocal(weekStart, i);
      const dateKey = formatDateKey(date);
      const dateMonth = date.getMonth() + 1;
      const weekday = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const isPracticeDay = practiceWeekdaySet.has(weekday);
      const avail = availByDate.get(dateKey) ?? {
        late: 0,
        unavailable: 0,
      };
      const available = isPracticeDay
        ? Math.max(totalMembers - avail.late - avail.unavailable, 0)
        : 0;
      const dayMatches = matchesByDate.get(dateKey) ?? [];

      days.push({
        date: dateKey,
        dayNumber: date.getDate(),
        isCurrentMonth: dateMonth === month,
        isToday: dateKey === today,
        isPracticeDay,
        available,
        late: avail.late,
        unavailable: avail.unavailable,
        matches: dayMatches,
      });
    }

    weeks.push({ weekStart: formatDateKey(weekStart), days });
    weekStart = addDaysLocal(weekStart, 7);
  }

  return weeks;
}

function formatMatchTime(value: string) {
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: COPENHAGEN_TIME_ZONE,
  });
}

function normalizeDateKey(value: string) {
  return value.slice(0, 10);
}

function getIsoWeekNumber(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - day);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
