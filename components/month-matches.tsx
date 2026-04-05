"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamMatchRow } from "@/types/team";

type Props = {
  teamId: string;
  month: string; // YYYY-MM
  today: string; // YYYY-MM-DD
  matches: TeamMatchRow[];
};

const DEFAULT_MATCH_TIME = "19:00";
const COPENHAGEN_TIME_ZONE = "Europe/Copenhagen";

export function MonthMatches({ teamId, month, today, matches }: Props) {
  const router = useRouter();
  const [matchDate, setMatchDate] = useState(getInitialDate(month, today));
  const [matchTime, setMatchTime] = useState(DEFAULT_MATCH_TIME);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editOpponent, setEditOpponent] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedMatches = useMemo(
    () => [...matches].sort((a, b) => a.match_date.localeCompare(b.match_date)),
    [matches]
  );

  const addMatch = async () => {
    if (!matchDate || !matchTime) {
      setMessage("Date and time are required");
      return;
    }

    if (matchDate < today) {
      setMessage("Please choose today or a future date");
      return;
    }

    setSaving(true);
    setMessage(null);

    const startAt = `${matchDate}T${matchTime}:00`;

    const res = await fetch("/api/team/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        matchDate,
        startAt,
        note: note || null,
      }),
    });

    const data = (await res.json()) as { ok?: boolean; error?: string };

    if (res.ok) {
      setMessage("Match added");
      setNote("");
      setMatchTime(DEFAULT_MATCH_TIME);
      router.refresh();
    } else {
      setMessage(data.error ?? "Failed to add match");
    }

    setSaving(false);
  };

  const startEdit = (item: TeamMatchRow) => {
    setEditingId(item.id);
    setEditDate(item.match_date);
    setEditTime(
      new Date(item.start_at).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: COPENHAGEN_TIME_ZONE,
      })
    );
    setEditOpponent(item.opponent === "TBD" ? "" : item.opponent);
    setEditNote(item.note ?? "");
    setEditMessage(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditMessage(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editDate || !editTime) {
      setEditMessage("Date and time are required");
      return;
    }

    setEditSaving(true);
    setEditMessage(null);

    const startAt = `${editDate}T${editTime}:00`;

    const res = await fetch("/api/team/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId,
        matchDate: editDate,
        startAt,
        opponent: editOpponent || "TBD",
        note: editNote || null,
      }),
    });

    const data = (await res.json()) as { ok?: boolean; error?: string };

    if (res.ok) {
      setEditingId(null);
      router.refresh();
    } else {
      setEditMessage(data.error ?? "Failed to save");
    }

    setEditSaving(false);
  };

  const deleteMatch = async (id: string) => {
    setDeletingId(id);

    const res = await fetch("/api/team/matches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      const data = (await res.json()) as { error?: string };
      setMessage(data.error ?? "Failed to delete match");
    }

    setDeletingId(null);
  };

  const openDatePicker = () => {
    const input = dateInputRef.current;
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
            <h3 className="text-lg font-semibold text-white">Add Match</h3>
            <p className="mt-1 text-sm text-white/70">
              Add official matches from the month view so everyone sees upcoming opponents.
            </p>
          </div>
         
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={openDatePicker}
            className="group relative rounded-lg border border-white/35 bg-black px-3 py-2 text-left outline-none ring-white/40 transition hover:bg-white hover:text-black focus:ring"
          >
            <span className="block text-xs text-white/60 transition group-hover:text-black/70">
              Match date
            </span>
            <span className="mt-1 block text-sm text-white transition group-hover:text-black">
              {matchDate || "Select date"}
            </span>
            <input
              ref={dateInputRef}
              type="date"
              min={today}
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </button>

          <input
            type="time"
            value={matchTime}
            onChange={(e) => setMatchTime(e.target.value)}
            className="rounded-lg border border-white/35 bg-black px-3 py-2 text-sm text-white outline-none ring-white/40 focus:ring"
          />

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (league, BO3, etc.)"
            className="rounded-lg border border-white/35 bg-black px-3 py-2 text-sm text-white outline-none ring-white/40 focus:ring"
          />
        </div>

        <button
          type="button"
          onClick={() => void addMatch()}
          disabled={saving}
          className="mt-4 rounded-lg border border-white/35 bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Add match"}
        </button>

        {message ? <p className="mt-3 text-sm text-white/70">{message}</p> : null}
      </section>

      <section className="rounded-2xl border border-white/35 bg-black p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-white">Matches This Month</h3>

        <div className="mt-4 space-y-3">
          {sortedMatches.length === 0 ? (
            <p className="text-sm text-white/65">No matches added yet.</p>
          ) : (
            sortedMatches.map((item) =>
              editingId === item.id ? (
                <div key={item.id} className="rounded-xl border border-white/35 bg-black p-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-white/60">Date</label>
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="w-full rounded-lg border border-white/35 bg-black px-3 py-2 text-sm text-white outline-none ring-white/40 focus:ring"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-white/60">Time</label>
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="w-full rounded-lg border border-white/35 bg-black px-3 py-2 text-sm text-white outline-none ring-white/40 focus:ring"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-white/60">Opponent</label>
                      <input
                        type="text"
                        value={editOpponent}
                        onChange={(e) => setEditOpponent(e.target.value)}
                        placeholder="Opponent (leave blank for TBD)"
                        className="w-full rounded-lg border border-white/35 bg-black px-3 py-2 text-sm text-white outline-none ring-white/40 focus:ring"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-white/60">Note</label>
                      <input
                        type="text"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Optional note"
                        className="w-full rounded-lg border border-white/35 bg-black px-3 py-2 text-sm text-white outline-none ring-white/40 focus:ring"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      disabled={editSaving}
                      className="rounded-lg border border-white/35 bg-black px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {editSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-lg border border-white/35 bg-black px-4 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                  {editMessage ? <p className="mt-2 text-xs text-white/70">{editMessage}</p> : null}
                </div>
              ) : (
                <div key={item.id} className="rounded-xl border border-white/25 bg-black p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-white">
                        {item.opponent && item.opponent !== "TBD" ? `vs ${item.opponent}` : "Scheduled match"}
                      </div>
                      <div className="mt-1 text-white/75">
                        {item.match_date} ·{" "}
                        {new Date(item.start_at).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: COPENHAGEN_TIME_ZONE,
                        })}
                      </div>
                      {item.note ? <div className="mt-1 text-white/60">{item.note}</div> : null}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="rounded-lg border border-white/35 bg-black px-3 py-1 text-xs font-medium text-white/70 transition hover:bg-white hover:text-black"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteMatch(item.id)}
                        disabled={deletingId === item.id}
                        className="rounded-lg border border-white/35 bg-black px-3 py-1 text-xs font-medium text-white/70 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingId === item.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </section>
    </div>
  );
}

function getInitialDate(month: string, today: string) {
  const monthStart = `${month}-01`;
  return today > monthStart ? today : monthStart;
}
