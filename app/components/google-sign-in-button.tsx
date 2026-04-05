"use client";

import { createClient } from "@/lib/supabase/client";

type GoogleSignInButtonProps = {
  className?: string;
  label?: string;
};

export function GoogleSignInButton({ className, label = "Sign in with Google" }: GoogleSignInButtonProps) {
  const signIn = async () => {
    const supabase = createClient();
    const origin = window.location.origin;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  };

  const classes = [
    "rounded-md bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      onClick={signIn}
      className={classes}
    >
      {label}
    </button>
  );
}
