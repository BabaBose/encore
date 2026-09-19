/**
 * Database access.
 *
 * The app talks to Postgres through one small interface rather than a driver,
 * so the same repository code runs against Supabase in production and against
 * an in-process Postgres in the tests. Both are real Postgres — the tests are
 * not checking a different dialect from the one that ships.
 *
 * Connections are pooled at module scope and sized for serverless: one client
 * per instance, through Supabase's transaction pooler, which is what keeps a
 * burst of lambdas from exhausting the database's connection limit.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface QueryResult<R = Record<string, unknown>> {
  rows: R[];
}

/** The whole surface the repositories need from a driver. */
export interface Sql {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
  /**
   * Runs a script of several statements, for schema work. Separate from
   * `query` because a parameterised statement goes over the extended protocol,
   * which carries exactly one command.
   */
  exec(sql: string): Promise<void>;
  /** Runs `fn` inside a transaction, on a single connection. */
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type Db = Sql;

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      'No database configured. Set DATABASE_URL (or POSTGRES_URL) to the Supabase ' +
        'connection string — the transaction pooler on port 6543 for serverless.',
    );
    this.name = 'MissingDatabaseUrlError';
  }
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new MissingDatabaseUrlError();
  return url;
}

/** Host and port of a connection string, with the credentials left out. */
export function describeConnection(url: string = databaseUrl()): { host: string; port: string } {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parsed.port || '5432' };
  } catch {
    return { host: '(unparseable connection string)', port: '' };
  }
}

/**
 * Supabase's direct database host resolves to IPv6 only. Vercel's build
 * containers and functions are IPv4-only, so a connection string pointing at it
 * fails to resolve — which looks like a mysterious fast build failure rather
 * than a networking mismatch. The pooler is IPv4 and is the right endpoint for
 * serverless regardless, so this is worth naming precisely.
 */
export function isSupabaseDirectHost(host: string): boolean {
  return /^db\.[a-z0-9]+\.supabase\.co$/.test(host);
}

/**
 * The connection is held on `globalThis`, not in a module variable.
 *
 * A bundler emits this module into more than one route chunk, and a dev server
 * reloads it; either way a plain module-level singleton becomes several. With
 * a real Postgres that only wastes pools, but the local file-backed database
 * ends up with two instances over one directory and they diverge — a session
 * written by a server action is then invisible to the page that follows it.
 */
interface DbGlobals {
  pool?: import('pg').Pool | null;
  shared?: Sql | null;
  localBoot?: Promise<Sql> | null;
}
const globals = globalThis as typeof globalThis & { __bookTheActDb?: DbGlobals };
globals.__bookTheActDb ??= {};
const store = globals.__bookTheActDb;

/** Wraps a `pg` pool in the `Sql` interface. */
export function createPgSql(connectionString: string = databaseUrl()): Sql {
  // Imported lazily so the tests, which never touch `pg`, do not load it.
  const { Pool } = require('pg') as typeof import('pg');

  store.pool ??= new Pool({
    connectionString,
    // A serverless instance handles one request at a time, so one connection is
    // all it can use — and holding more would waste the database's budget.
    max: Number(process.env.DATABASE_POOL_MAX ?? (process.env.VERCEL ? 1 : 10)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Supabase terminates TLS with its own chain; verifying it needs the CA
    // bundle shipped, which is not worth it for a pooled managed database.
    ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });

  const wrap = (runner: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }): Sql => ({
    async query<R>(text: string, params: unknown[] = []) {
      const result = await runner.query(text, params);
      return { rows: result.rows as R[] };
    },
    async exec(sql: string) {
      await runner.query(sql);
    },
    async transaction<T>(_fn: (tx: Sql) => Promise<T>): Promise<T> {
      throw new Error('Nested transactions are not supported');
    },
    async close() {
      /* the pool owns the lifetime */
    },
  });

  return {
    async query<R>(text: string, params: unknown[] = []) {
      const result = await store.pool!.query(text, params as never[]);
      return { rows: result.rows as R[] };
    },
    async exec(sql: string) {
      // No parameters, so this goes over the simple protocol, which accepts a
      // script of several statements.
      await store.pool!.query(sql);
    },
    async transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
      const client = await store.pool!.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (err) {
        // A failed transaction must leave nothing behind: a confirmation that
        // could not block its dates must not have moved the inquiry either.
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await store.pool?.end();
      store.pool = null;
      store.shared = null;
    },
  };
}

/**
 * The shared connection the app uses.
 *
 * With no `DATABASE_URL` set outside production it falls back to an
 * in-process Postgres under `data/`, so `npm run dev` works on a fresh clone
 * with nothing to install or connect to.
 *
 * A production build refuses that fallback unless `BOOKTHEACT_LOCAL_DB=1` asks
 * for it explicitly — useful for running the real build locally, and never
 * something a deployment can land in by accident.
 */
export function getDb(): Sql {
  if (store.shared) return store.shared;

  const hasUrl = !!(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
  if (hasUrl) {
    store.shared = createPgSql();
    return store.shared;
  }

  const localAllowed = process.env.NODE_ENV !== 'production' || process.env.BOOKTHEACT_LOCAL_DB === '1';
  if (!localAllowed) throw new MissingDatabaseUrlError();
  store.shared = createLocalSql();
  return store.shared;
}

/**
 * A lazily-opened local Postgres. Every call is queued behind the one boot, so
 * concurrent requests on a cold start do not each try to start their own.
 */
function createLocalSql(): Sql {
  const open = async (): Promise<Sql> => {
    store.localBoot ??= (async () => {
      const { createLocalDb } = await import('./pglite');
      return createLocalDb(join(process.cwd(), 'data', 'pglite'));
    })();
    return store.localBoot;
  };

  return {
    async query(text, params) {
      return (await open()).query(text, params);
    },
    async exec(sql) {
      return (await open()).exec(sql);
    },
    async transaction(fn) {
      return (await open()).transaction(fn);
    },
    async close() {
      if (store.localBoot) await (await store.localBoot).close();
      store.localBoot = null;
      store.shared = null;
    },
  };
}

/**
 * Read from the working directory rather than from beside this module: under a
 * bundler `import.meta.dirname` is not a filesystem path, and the schema is
 * only ever needed from a checkout — by `npm run db:push`, by the tests, and by
 * the local fallback database. The deployed app never applies DDL.
 */
export function schemaSql(): string {
  const path = join(process.cwd(), 'src', 'db', 'schema.sql');
  if (!existsSync(path)) {
    throw new Error(
      `Could not find ${path}. The schema is applied from a checkout — run \`npm run db:push\` there, not from a deployment.`,
    );
  }
  return readFileSync(path, 'utf8');
}

/**
 * Apply the schema. Idempotent — every statement is `IF NOT EXISTS` — so it is
 * safe to run against a database that is already up to date.
 *
 * This is a deploy-time step (`npm run db:push`), never a request-time one: a
 * serverless instance has no business issuing DDL on a cold start.
 */
export async function migrate(db: Sql): Promise<void> {
  await db.exec(schemaSql());
  for (const { table, column, definition } of ADDED_COLUMNS) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
  }
}

/**
 * Columns added after a table first shipped.
 *
 * `schema.sql` creates tables only when they do not exist, so it never alters
 * one that does. These run afterwards, and `IF NOT EXISTS` makes each a no-op
 * on a database that already has the column.
 */
const ADDED_COLUMNS: Array<{ table: string; column: string; definition: string }> = [
  {
    table: 'entertainers',
    column: 'residency_inquiry_policy',
    definition: "TEXT NOT NULL DEFAULT 'when_largely_free'",
  },
];
