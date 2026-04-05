import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type UpdateAccountPayload = {
  displayName?: string;
};

function sanitizeDisplayName(value: string | undefined) {
  return (value ?? "").trim();
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as UpdateAccountPayload;
  const displayName = sanitizeDisplayName(body.displayName);

  if (displayName.length < 2 || displayName.length > 60) {
    return NextResponse.json(
      { error: "displayName must be between 2 and 60 characters" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Account deletion is not configured on the server" },
      { status: 500 }
    );
  }

  const { error: detachOwnerError } = await admin
    .from("teams")
    .update({ created_by: null })
    .eq("created_by", user.id);

  if (detachOwnerError) {
    return NextResponse.json({ error: detachOwnerError.message }, { status: 400 });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}