import Link from "next/link";

type ErrorPageProps = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function AuthErrorPage({ searchParams }: ErrorPageProps) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Sign-in failed
      </h1>
      <p className="mt-4 text-slate-600">
        We could not complete Google sign-in. Please try again.
      </p>
      {params.reason ? (
        <p className="mt-3 rounded-md bg-slate-100 p-3 text-sm text-slate-700">
          {params.reason}
        </p>
      ) : null}
      <div className="mt-8">
        <Link
          href="/"
          className="rounded-md bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
