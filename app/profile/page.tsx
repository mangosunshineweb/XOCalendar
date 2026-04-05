import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileAccountForm } from "@/components/profile-account-form";
import { SignOutButton } from "@/app/components/sign-out-button";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-white/35 bg-black p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
              Account
            </p>
            <h1 className="mt-2 text-3xl font-bold">Profile</h1>
            <p className="mt-2 text-sm text-white/70">Manage your profile details and account.</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2 text-sm font-bold uppercase tracking-widest text-white transition duration-300 hover:-translate-y-0.5 hover:border-white sm:px-6 sm:py-2.5 sm:text-base"
            >
              Dashboard
              <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">
                -&gt;
              </span>
            </Link>
  
          </div>
        </div>
      </section>

      <ProfileAccountForm
        email={user.email ?? "Unknown user"}
        initialDisplayName={profile?.display_name ?? ""}
      />

      <section className="space-y-3 rounded-3xl border border-white/35 bg-black p-6 text-white">
        <h2 className="text-xl font-semibold">Google Calendar</h2>
        <p className="text-sm text-white/70">
          Calendar sync is currently running in no-verification mode. You can still add practice sessions from the dashboard using the Open in Google action.
        </p>
      </section>
                <SignOutButton/>
    </main>
  );
}