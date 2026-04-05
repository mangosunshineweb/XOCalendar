# XO Team Calendar MVP

Weekly CS team planning with:

- Supabase Auth (Google OAuth)
- Supabase Postgres for availability data
- Next.js App Router route handlers for secure Google API calls

## 1. Environment variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

For Vercel production, add these same variables in Project Settings -> Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`)

If this project is in a monorepo, set Vercel Project Settings -> Root Directory to this app folder.

## 2. Supabase Auth (Google)

1. In Supabase Auth providers, enable Google.
2. In Google Cloud Console OAuth client:
	- Add your site URL in Authorized JavaScript origins.
	- Add your Supabase callback URL in Authorized redirect URIs.
3. Keep Google scopes for calendar access:
	- `https://www.googleapis.com/auth/calendar`
	- `https://www.googleapis.com/auth/calendar.events`

## 3. Database tables

Run [supabase/schema.sql](supabase/schema.sql) in Supabase SQL editor.

## 4. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## MVP routes and pages

- Home with Google sign-in: [app/page.tsx](app/page.tsx)
- OAuth callback: [app/auth/callback/route.ts](app/auth/callback/route.ts)
- Auth error page: [app/auth/error/page.tsx](app/auth/error/page.tsx)
- Weekly board dashboard: [app/dashboard/page.tsx](app/dashboard/page.tsx)
- Manual availability API: [app/api/team/availability/route.ts](app/api/team/availability/route.ts)
- Google FreeBusy API: [app/api/google/freebusy/route.ts](app/api/google/freebusy/route.ts)
- Google event creation API: [app/api/google/events/route.ts](app/api/google/events/route.ts)

## Notes

- Google API calls are server-side route handlers.
- Current dashboard uses placeholder teammates and focuses on MVP flow.
- Next step is wiring real team members and saved board state from Supabase.
