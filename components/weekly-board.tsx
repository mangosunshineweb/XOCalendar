"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { PracticeWindow } from "@/lib/team/practice-windows";
import type {
  AvailabilityStatus,
  TeamMatchRow,
  TeamMemberRow,
  WeeklyAvailabilityRow,
} from "@/types/team";

type Props = {
  teamId: string;
  currentUserId: string;
  windows: PracticeWindow[];
  members: TeamMemberRow[];
  availability: WeeklyAvailabilityRow[];
  matches: TeamMatchRow[];
};

type DayTotals = {
  available: number;
  late: number;
  unavailable: number;
};

const COPENHAGEN_TIME_ZONE = "Europe/Copenhagen";

export function WeeklyBoard({
  teamId,
  currentUserId,
  windows,
  members,
  availability,
  matches,
}: Props) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [localAvailability, setLocalAvailability] = useState(() =>
    dedupeAvailabilityRows(availability)
  );
  const [eventMessage, setEventMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocalAvailability(dedupeAvailabilityRows(availability));
  }, [availability]);

  const availabilityByUserAndDate = useMemo(() => {
    const byKey = new Map<string, WeeklyAvailabilityRow>();

    for (const item of localAvailability) {
      byKey.set(`${item.user_id}|${normalizeDateKey(item.practice_date)}`, item);
    }

    return byKey;
  }, [localAvailability]);

  const roster = useMemo(
    () =>
      members.map((member) => {
        const profile = Array.isArray(member.profiles)
          ? member.profiles[0] ?? null
          : member.profiles;

        return {
          id: member.user_id,
          role: member.role,
          name: profile?.display_name ?? "Player",
        };
      }),
    [members]
  );

  const totalsByDate = useMemo(() => {
    const rosterUserIds = new Set(roster.map((member) => member.id));

    const baseEntries = windows.map((window) => [
      window.date,
      {
        available: window.isPracticeDay ? roster.length : 0,
        late: 0,
        unavailable: 0,
      } as DayTotals,
    ]);

    const summary = Object.fromEntries(baseEntries) as Record<string, DayTotals>;

    for (const item of availabilityByUserAndDate.values()) {
      if (!rosterUserIds.has(item.user_id)) {
        continue;
      }

      const practiceDateKey = normalizeDateKey(item.practice_date);
      const day = summary[practiceDateKey];
      if (!day) {
        continue;
      }

      if (item.status === "late") {
        day.available -= 1;
        day.late += 1;
      } else if (item.status === "unavailable") {
        day.available -= 1;
        day.unavailable += 1;
      }
    }

    return summary;
  }, [availabilityByUserAndDate, roster, windows]);

  const practiceDaysCount = useMemo(
    () => windows.filter((window) => window.isPracticeDay).length,
    [windows]
  );

  const boardGridColumns = useMemo(
    () => `210px repeat(${windows.length}, minmax(190px, 1fr))`,
    [windows.length]
  );

  const matchesByDate = useMemo(() => {
    const grouped = new Map<string, TeamMatchRow[]>();
    for (const match of matches) {
      const matchDateKey = normalizeDateKey(match.match_date);
      const entries = grouped.get(matchDateKey) ?? [];
      entries.push(match);
      grouped.set(matchDateKey, entries);
    }

    for (const entries of grouped.values()) {
      entries.sort((a, b) => a.start_at.localeCompare(b.start_at));
    }

    return grouped;
  }, [matches]);

  const weekNumber = useMemo(() => {
    if (windows.length === 0) {
      return null;
    }

    return getIsoWeekNumber(windows[0].date);
  }, [windows]);

  const getStatus = (userId: string, date: string, isPracticeDay: boolean) => {
    const storedStatus = availabilityByUserAndDate.get(`${userId}|${date}`)?.status;

    if (storedStatus) {
      return storedStatus;
    }

    if (isPracticeDay) {
      return "available";
    }

    return undefined;
  };

  const openGoogleCalendarTemplate = (practiceWindow: PracticeWindow) => {
    if (!practiceWindow.isPracticeDay || !practiceWindow.startTime || !practiceWindow.endTime) {
      setEventMessage("This day is not a default practice day.");
      return;
    }

    const templateUrl = buildGoogleCalendarTemplateUrl(practiceWindow);
    globalThis.open(templateUrl, "_blank", "noopener,noreferrer");
  };

  const saveStatus = async (
    practiceDate: string,
    startTime: string | null,
    endTime: string | null,
    status: AvailabilityStatus
  ) => {
    if (!startTime || !endTime) {
      return;
    }

    const key = `${currentUserId}-${practiceDate}`;
    setSavingKey(key);
    setEventMessage(null);

    const startAt = `${practiceDate}T${startTime}:00`;
    const endAt = `${practiceDate}T${endTime}:00`;

    const previousAvailability = localAvailability;
    const optimistic = [...localAvailability];
    const existingIndex = findAvailabilityIndexByUserAndDate(
      optimistic,
      currentUserId,
      practiceDate
    );

    if (existingIndex >= 0) {
      optimistic[existingIndex] = {
        ...optimistic[existingIndex],
        status,
      };
    } else {
      optimistic.push({
        id: crypto.randomUUID(),
        user_id: currentUserId,
        practice_date: practiceDate,
        status,
        note: null,
      });
    }

    setLocalAvailability(dedupeAvailabilityRows(optimistic));

    const response = await fetch("/api/team/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        practiceDate,
        startAt,
        endAt,
        status,
      }),
    });

    if (!response.ok) {
      setLocalAvailability(previousAvailability);
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setEventMessage(data?.error ?? "Could not save your response. Please try again.");
    }

    setSavingKey(null);
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-white/35 bg-black">
        <div className="border-b border-white/20 bg-black px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">
                This Week{weekNumber ? ` · Week ${weekNumber}` : ""}
              </h2>
              <p className="mt-1 text-sm text-white/70">
                Your row is editable. The header shows per-day totals for quick team readiness.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/35 bg-black px-3 py-1 text-xs font-semibold text-white/80">
              <span>{roster.length} players</span>
              <span className="h-1 w-1 rounded-full bg-white/50" />
              <span>{practiceDaysCount} sessions</span>
            </div>
          </div>
          {eventMessage ? (
            <p className="mt-3 rounded-lg border border-white/35 bg-black px-3 py-2 text-sm text-white/80">
              {eventMessage}
            </p>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-215">
            <div className="grid border-b border-white/20 bg-black" style={{ gridTemplateColumns: boardGridColumns }}>
              <div className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
                Player
              </div>

              {windows.map((window) => {
                const dayTotals = totalsByDate[window.date] ?? {
                  available: 0,
                  late: 0,
                  unavailable: 0,
                };

                return (
                  <div key={window.id} className="space-y-2 border-l border-white/20 px-4 py-3">
                    <div className="font-semibold text-white">{window.label}</div>
                    {matchesByDate.get(window.date)?.length ? (
                      <div className="space-y-1 rounded border border-white/25 bg-black px-2 py-1">
                        <div className="inline-flex rounded-full border border-white/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                          Match {(matchesByDate.get(window.date)?.length ?? 0) > 1 ? `(${matchesByDate.get(window.date)?.length})` : ""}
                        </div>
                        {matchesByDate.get(window.date)?.slice(0, 2).map((match) => (
                          <div key={match.id} className="truncate text-[11px] text-white/85">
                            {formatMatchTime(match.start_at)} {match.opponent && match.opponent !== "TBD" ? `vs ${match.opponent}` : "match"}
                          </div>
                        ))}
                        {(matchesByDate.get(window.date)?.length ?? 0) > 2 ? (
                          <div className="text-[10px] text-white/55">+more matches</div>
                        ) : null}
                      </div>
                    ) : null}
                    {window.isPracticeDay && window.startTime && window.endTime ? (
                      <>
                        <div className="text-xs text-white/65">
                          {window.startTime}-{window.endTime}
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          <TinyStat tone="available" value={dayTotals.available} />
                          <TinyStat tone="late" value={dayTotals.late} />
                          <TinyStat tone="unavailable" value={dayTotals.unavailable} />
                        </div>
                        <div className="text-[11px] text-white/65">
                          {dayTotals.available}/{roster.length} 
                        </div>
                      </>
                    ) : (
                      <div className="inline-flex rounded-full border border-white/25 px-2.5 py-1 text-[11px] text-white/65">
                        Off day
                      </div>
                    )}
                    {window.isPracticeDay ? (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => openGoogleCalendarTemplate(window)}
                          className="rounded-md border border-white/35 bg-black px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-white hover:text-black"
                        >
                          Open in Google
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {roster.map((member, memberIndex) => {
              const rowTone = memberIndex % 2 === 0 ? "bg-black" : "bg-black/95";

              return (
                <div
                  key={member.id}
                  className={`grid h-36 border-b border-white/15 ${rowTone}`}
                  style={{ gridTemplateColumns: boardGridColumns }}
                >
                  <div className="h-full px-4 py-4">
                    <p className="font-medium text-white">{member.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.08em] text-white/55">
                      {member.role}
                    </p>
                  </div>

                  {windows.map((window) => {
                    const status = getStatus(member.id, window.date, window.isPracticeDay);
                    const isCurrentUser = member.id === currentUserId;
                    const isSaving = savingKey === `${currentUserId}-${window.date}`;

                    return (
                      <div
                        key={`${member.id}-${window.date}`}
                        className="h-full border-l border-white/15 px-4 py-4"
                      >
                        {!window.isPracticeDay ? (
                          <div className="text-sm text-white/50">No default practice</div>
                        ) : null}

                        {isCurrentUser ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs text-white/70">
                              <span>{isSaving ? "Saving..." : status ?? "No answer"}</span>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              <StatusButton
                                active={status === "available"}
                                color="green"
                                disabled={!window.isPracticeDay}
                                onClick={() =>
                                  saveStatus(
                                    window.date,
                                    window.startTime,
                                    window.endTime,
                                    "available"
                                  )
                                }
                              >
                                Yes
                              </StatusButton>

                              <StatusButton
                                active={status === "late"}
                                color="yellow"
                                disabled={!window.isPracticeDay}
                                onClick={() =>
                                  saveStatus(
                                    window.date,
                                    window.startTime,
                                    window.endTime,
                                    "late"
                                  )
                                }
                              >
                                Late
                              </StatusButton>

                              <StatusButton
                                active={status === "unavailable"}
                                color="red"
                                disabled={!window.isPracticeDay}
                                onClick={() =>
                                  saveStatus(
                                    window.date,
                                    window.startTime,
                                    window.endTime,
                                    "unavailable"
                                  )
                                }
                              >
                                No
                              </StatusButton>
                            </div>
                          </div>
                        ) : (
                          <StatusPill status={status} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function findAvailabilityIndexByUserAndDate(
  rows: WeeklyAvailabilityRow[],
  userId: string,
  practiceDate: string
) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const item = rows[index];
    if (item.user_id === userId && normalizeDateKey(item.practice_date) === practiceDate) {
      return index;
    }
  }

  return -1;
}

function dedupeAvailabilityRows(rows: WeeklyAvailabilityRow[]) {
  const byKey = new Map<string, WeeklyAvailabilityRow>();

  for (const row of rows) {
    byKey.set(`${row.user_id}|${normalizeDateKey(row.practice_date)}`, row);
  }

  return Array.from(byKey.values());
}

function TinyStat({ tone, value }: { tone: AvailabilityStatus; value: number }) {
  const map: Record<AvailabilityStatus, string> = {
    available: "border-white/35 bg-black text-white",
    late: "border-white/35 bg-black text-white",
    unavailable: "border-white/35 bg-black text-white",
  };

  const label: Record<AvailabilityStatus, string> = {
    available: "Yes",
    late: "Late",
    unavailable: "No",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[tone]}`}>
      {label[tone]} {value}
    </span>
  );
}

function StatusButton({
  children,
  onClick,
  active,
  disabled = false,
  color,
}: {
  children: ReactNode;
  onClick: () => void;
  active: boolean;
  disabled?: boolean;
  color: "green" | "yellow" | "red";
}) {
  const styles = {
    green: active
      ? "border-white bg-white text-black"
      : "border-white/35 bg-black text-white hover:bg-white hover:text-black",
    yellow: active
      ? "border-white bg-white text-black"
      : "border-white/35 bg-black text-white hover:bg-white hover:text-black",
    red: active
      ? "border-white bg-white text-black"
      : "border-white/35 bg-black text-white hover:bg-white hover:text-black",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${styles[color]} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status?: AvailabilityStatus }) {
  if (!status) {
    return <div className="text-sm text-white/55">No answer</div>;
  }

  const map: Record<AvailabilityStatus, string> = {
    available: "border-white/35 bg-black text-white",
    late: "border-white/35 bg-black text-white",
    unavailable: "border-white/35 bg-black text-white",
  };

  const label: Record<AvailabilityStatus, string> = {
    available: "Available",
    late: "Late",
    unavailable: "Unavailable",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${map[status]}`}>
      {label[status]}
    </span>
  );
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

function toGoogleLocalDateTime(date: string, time: string) {
  const compactDate = date.replaceAll("-", "");
  const compactTime = time.replaceAll(":", "");
  return `${compactDate}T${compactTime}00`;
}

function buildGoogleCalendarTemplateUrl(practiceWindow: PracticeWindow) {
  const startAt = toGoogleLocalDateTime(practiceWindow.date, practiceWindow.startTime ?? "18:00");
  const endAt = toGoogleLocalDateTime(practiceWindow.date, practiceWindow.endTime ?? "20:00");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "CS Team Practice",
    details: `Team practice session for ${practiceWindow.label}`,
    dates: `${startAt}/${endAt}`,
    ctz: COPENHAGEN_TIME_ZONE,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function getIsoWeekNumber(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - day);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

