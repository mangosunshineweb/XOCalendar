"use client";

import { GoogleSignInButton } from "@/app/components/google-sign-in-button";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">CS Team Calendar</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in with Google to manage team availability and calendar sync.
        </p>

        <div className="mt-6">
          <GoogleSignInButton className="w-full rounded-lg px-4 py-3" label="Continue with Google" />
        </div>
      </div>
    </main>
  );
}
