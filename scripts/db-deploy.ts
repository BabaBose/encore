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
import { createPgSql, migrate, MissingDatabaseUrlError } from '../src/db/client';
import { seedDatabase } from './seed';

async function main(): Promise<void> {
  const force = process.argv.includes('--force-seed');
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
  console.error(err);
  process.exit(1);
});
