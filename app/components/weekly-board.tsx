"use client";

import { useMemo, useState } from "react";

type AvailabilityStatus = "available" | "late" | "unavailable";

type Player = {
  id: string;
  displayName: string;
};

type PracticeDay = {
  date: string;
  label: string;
  startAt: string;
  endAt: string;
};

type WeeklyBoardProps = {
  teamId: string;
  currentUserId: string;
  players: Player[];
  practiceDays: PracticeDay[];
};

const STATUS_STYLE: Record<AvailabilityStatus, string> = {
  available: "bg-emerald-100 text-emerald-900",
  late: "bg-amber-100 text-amber-900",
  unavailable: "bg-rose-100 text-rose-900",
};

function keyFor(userId: string, practiceDate: string) {
  return `${userId}::${practiceDate}`;
}

export function WeeklyBoard({
  teamId,
  currentUserId,
  players,
  practiceDays,
}: WeeklyBoardProps) {
  const [statusMap, setStatusMap] = useState<Record<string, AvailabilityStatus>>(
    {}
  );
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      players.map((player) => ({
        ...player,
        values: practiceDays.map((day) => {
          const cellKey = keyFor(player.id, day.date);
          const value = statusMap[cellKey] ?? "unavailable";
          return { day, cellKey, value };
        }),
      })),
    [players, practiceDays, statusMap]
  );

  const setStatus = async (
    userId: string,
    day: PracticeDay,
    status: AvailabilityStatus
  ) => {
    const cellKey = keyFor(userId, day.date);
    const previous = statusMap[cellKey];

    setSavingCell(cellKey);
    setErrorMessage(null);
    setStatusMap((prev) => ({ ...prev, [cellKey]: status }));

    const response = await fetch("/api/team/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        userId,
        practiceDate: day.date,
        startAt: day.startAt,
        endAt: day.endAt,
        status,
      }),
    });

    if (!response.ok) {
      setStatusMap((prev) => ({ ...prev, [cellKey]: previous ?? "unavailable" }));
      setErrorMessage("Could not save availability. Please try again.");
    }

    setSavingCell(null);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Weekly Availability</h2>
      <p className="mt-1 text-sm text-slate-600">
        Each teammate can update only their own row in this MVP.
      </p>

      {errorMessage ? (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-190 border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-slate-200 px-3 py-3 font-semibold text-slate-700">
                Player
              </th>
              {practiceDays.map((day) => (
                <th
                  key={day.date}
                  className="border-b border-slate-200 px-3 py-3 font-semibold text-slate-700"
                >
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((player) => (
              <tr key={player.id}>
                <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-800">
                  {player.displayName}
                </td>
                {player.values.map(({ day, cellKey, value }) => {
                  const isSelf = player.id === currentUserId;
                  const isSaving = savingCell === cellKey;

                  return (
                    <td key={cellKey} className="border-b border-slate-100 px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {(
                          ["available", "late", "unavailable"] as AvailabilityStatus[]
                        ).map((option) => {
                          const isActive = value === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              disabled={!isSelf || isSaving}
                              onClick={() => setStatus(player.id, day, option)}
                              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                isActive
                                  ? STATUS_STYLE[option]
                                  : "bg-slate-100 text-slate-500"
                              } ${!isSelf ? "cursor-not-allowed opacity-60" : "hover:opacity-90"}`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
