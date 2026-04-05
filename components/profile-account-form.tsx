"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  email: string;
  initialDisplayName: string;
};

export function ProfileAccountForm({
  email,
  initialDisplayName,
}: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update profile");
      }

      setMessage("Profile updated.");
      router.refresh();
    } catch (unknownError) {
      const errorMessage =
        unknownError instanceof Error ? unknownError.message : "Failed to update profile";
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    const confirmed = window.confirm(
      "Delete your account permanently? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete account");
      }

      router.replace("/login?deleted=1");
      router.refresh();
    } catch (unknownError) {
      const errorMessage =
        unknownError instanceof Error ? unknownError.message : "Failed to delete account";
      setError(errorMessage);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-6 rounded-3xl border border-white/35 bg-black p-6 text-white">
      <form onSubmit={onSave} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-white/80">
            Email
          </label>
          <input
            id="email"
            value={email}
            disabled
            className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/70"
          />
        </div>

        <div>
          <label htmlFor="displayName" className="block text-sm font-semibold text-white/80">
            Display name
          </label>
          <input
            id="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            minLength={2}
            maxLength={60}
            className="mt-1 w-full rounded-lg border border-white/35 bg-black px-3 py-2 text-sm text-white"
          />
        </div>

        {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex rounded-full border border-white/35 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>

      <div className="border-t border-white/15 pt-6">
        <h2 className="text-lg font-semibold text-red-300">Danger zone</h2>
        <p className="mt-1 text-sm text-white/70">
          Deleting your account permanently removes your profile and related team records.
        </p>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="mt-4 inline-flex rounded-full border border-red-400/60 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {deleting ? "Deleting..." : "Delete account"}
        </button>
      </div>
    </section>
  );
}