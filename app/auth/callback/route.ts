import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/dashboard";

  if (!next.startsWith("/")) {
    next = "/dashboard";
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const user = data.user;

      if (user) {
        const guessedName =
          typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name
            ? user.user_metadata.full_name
            : user.email?.split("@")[0] ?? "Player";

        await supabase.from("profiles").upsert({
          id: user.id,
          display_name: guessedName,
          email: user.email ?? null,
        });
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
