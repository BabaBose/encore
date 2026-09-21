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
  connectionStringProblem,
  createPgSql,
  databaseUrl,
  describeConnection,
  isSupabaseDirectHost,
  migrate,
  MissingDatabaseUrlError,
} from '../src/db/client';
import { seedDatabase } from './seed';
import { reportDeployProblem } from './report-deploy-problem';

async function main(): Promise<void> {
  const force = process.argv.includes('--force-seed');

  const url = databaseUrl();

  // Check the string itself before trying to use it: a bad paste otherwise
  // surfaces as a driver error that says nothing about what to fix.
  const problem = connectionStringProblem(url);
  if (problem) {
    await reportDeployProblem({ step: 'validate-connection-string', problem });
    console.error(
      [
        '',
        'The database connection string is not usable:',
        `  ${problem}`,
        '',
        `It came from ${process.env.DATABASE_URL ? 'DATABASE_URL' : 'POSTGRES_URL'}.`,
        'Expected shape (one line, no quotes, no spaces):',
        '  postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  // Say where we are connecting before trying, so a failure in a build log is
  // readable without guessing which of several URLs was picked up.
  const { host, port } = describeConnection(url);
  console.log(`Connecting to ${host}:${port}`);
  if (isSupabaseDirectHost(host)) {
    console.warn(
      `\nWarning: ${host} is Supabase's direct endpoint, which resolves to IPv6 only.\n` +
        'Vercel is IPv4-only, so this will fail to resolve. Use the transaction pooler\n' +
        '(aws-…-<region>.pooler.supabase.com, port 6543) instead.\n',
    );
  }

  const db = createPgSql();

  try {
    await migrate(db);
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { name?: string };
    await reportDeployProblem({
      step: 'apply-schema',
      host,
      port,
      errorName: e?.name,
      errorCode: e?.code,
      errorMessage: e?.message,
    });
    throw err;
  }
  console.log('Schema applied.');

  const { rows } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM users');
  const existing = Number(rows[0].n);

  if (existing > 0 && !force) {
    console.log(`Database already has ${existing} accounts - leaving the data alone.`);
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
        'pooler instead - Supabase → Project Settings → Database → Connection string',
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
