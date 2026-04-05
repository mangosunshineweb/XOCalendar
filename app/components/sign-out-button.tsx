"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SignOutButtonProps = {
  className?: string;
};

export function SignOutButton({ className }: SignOutButtonProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const onSignOut = async () => {
    setIsSigningOut(true);

    const supabase = createClient();
    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  };

  const classes = [
    "inline-flex shrink-0 items-center justify-center rounded-full border border-white/45 px-5 py-2 text-xs font-bold uppercase tracking-widest text-white transition duration-300 hover:-translate-y-0.5 hover:border-white disabled:cursor-not-allowed disabled:opacity-60 sm:px-6 sm:py-2.5",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" onClick={onSignOut} disabled={isSigningOut} className={classes}>
      {isSigningOut ? "Signing out..." : "Sign out"}
    </button>
  );
}