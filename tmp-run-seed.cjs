/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const { Client } = require('pg');

function readEnv(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

(async () => {
  const env = readEnv('.env.local');
  const cs = env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');

  const seedSql = fs.readFileSync('supabase/seed.sql', 'utf8');
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const before = await c.query("select count(*)::int as auth_users from auth.users");
  console.log('AUTH_USERS_BEFORE', before.rows[0].auth_users);

  if (before.rows[0].auth_users === 0) {
    console.log('SEED_SKIPPED_NO_AUTH_USERS');
    await c.end();
    process.exit(0);
  }

  await c.query('begin');
  await c.query(seedSql);
  await c.query('commit');

  const after = await c.query(`
    select
      (select count(*)::int from auth.users) as auth_users,
      (select count(*)::int from public.profiles) as profiles,
      (select count(*)::int from public.teams) as teams,
      (select count(*)::int from public.team_members) as team_members,
      (select count(*)::int from public.default_practice_days) as default_practice_days
  `);

  const team = await c.query("select id, name, timezone from public.teams where id = '78466703-d22e-4ecf-989c-4de14772d8fc'::uuid");
  console.log('COUNTS_AFTER', after.rows[0]);
  console.log('TEAM_EXTRA_ORDINEM', team.rows);

  await c.end();
})().catch((e) => {
  console.error('SEED_FAILED');
  console.error(e.message);
  process.exit(1);
});
