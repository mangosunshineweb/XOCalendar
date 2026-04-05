import { redirect } from "next/navigation";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  const params = await searchParams;

  if (params.code) {
    const callbackParams = new URLSearchParams({ code: params.code });

    if (params.next) {
      callbackParams.set("next", params.next);
    }

    redirect(`/auth/callback?${callbackParams.toString()}`);
  }

  redirect("/login");
}
