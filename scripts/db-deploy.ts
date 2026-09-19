/**
 * Prepare the database for a deployment.
 *
 * Applies the schema, then loads the demo marketplace *only if the database is
 * empty*. That makes the first deploy self-bootstrapping while making it
 * impossible for a later deploy to wipe real accounts and bookings — which is
 * exactly what an unconditional seed in a build command would eventually do.
 *
 * Pass `--force-seed` to reload the demo data deliberately.
 */
import {
  createPgSql,
  databaseUrl,
  describeConnection,
  isSupabaseDirectHost,
  migrate,
  MissingDatabaseUrlError,
} from '../src/db/client';
import { seedDatabase } from './seed';

async function main(): Promise<void> {
  const force = process.argv.includes('--force-seed');

  // Say where we are connecting before trying, so a failure in a build log is
  // readable without guessing which of several URLs was picked up.
  const { host, port } = describeConnection(databaseUrl());
  console.log(`Connecting to ${host}:${port}`);
  if (isSupabaseDirectHost(host)) {
    console.warn(
      `\nWarning: ${host} is Supabase's direct endpoint, which resolves to IPv6 only.\n` +
        'Vercel is IPv4-only, so this will fail to resolve. Use the transaction pooler\n' +
        '(aws-…-<region>.pooler.supabase.com, port 6543) instead.\n',
    );
  }

  const db = createPgSql();

  await migrate(db);
  console.log('Schema applied.');

  const { rows } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM users');
  const existing = Number(rows[0].n);

  if (existing > 0 && !force) {
    console.log(`Database already has ${existing} accounts — leaving the data alone.`);
  } else {
    const counts = await seedDatabase(db);
    console.log('Seeded the demo marketplace:', counts);
  }

  await db.close();
}

main().catch((err) => {
  // A build log is the wrong place to read a stack trace to work out that an
  // environment variable is missing.
  if (err instanceof MissingDatabaseUrlError) {
    console.error(
      [
        '',
        'No database configured, so the schema could not be applied.',
        '',
        'Set DATABASE_URL on this deployment to the Supabase connection string:',
        '  Supabase → Project Settings → Database → Connection string → Transaction pooler',
        '  (port 6543, which is the one suited to serverless), with the password filled in.',
        '',
        'Then add it in Vercel → Project → Settings → Environment Variables and redeploy.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  const { host } = describeConnection(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '');
  if ((err as NodeJS.ErrnoException)?.code === 'ENOTFOUND' && isSupabaseDirectHost(host)) {
    console.error(
      [
        '',
        `Could not resolve ${host}.`,
        '',
        "That is Supabase's direct endpoint and it has no IPv4 address. Vercel is",
        'IPv4-only, so it can never reach it. Set DATABASE_URL to the transaction',
        'pooler instead — Supabase → Project Settings → Database → Connection string',
        '→ Transaction pooler (port 6543). DATABASE_URL takes precedence over the',
        "integration's POSTGRES_URL.",
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
