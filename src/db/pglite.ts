/**
 * An in-process Postgres, for tests and for running the app with no database
 * to connect to.
 *
 * PGlite is Postgres itself compiled to WebAssembly, so the tests exercise the
 * same dialect, the same constraint enforcement and the same transaction
 * semantics as Supabase — not a SQLite approximation of them.
 *
 * Also backs local development when no `DATABASE_URL` is set. Never used in
 * production: `pg` against Supabase is the deployed path.
 */
import { PGlite } from '@electric-sql/pglite';
import { migrate, type Sql } from './client';

function wrap(pg: PGlite, isTx = false): Sql {
  return {
    async query<R>(text: string, params: unknown[] = []) {
      const result = await pg.query(text, params as never[]);
      return { rows: result.rows as R[] };
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
      if (isTx) throw new Error('Nested transactions are not supported');
      // PGlite is single-connection, so the transaction runs on the same
      // handle; BEGIN/ROLLBACK still give all-or-nothing.
      await pg.exec('BEGIN');
      try {
        const out = await fn(wrap(pg, true));
        await pg.exec('COMMIT');
        return out;
      } catch (err) {
        await pg.exec('ROLLBACK').catch(() => {});
        throw err;
      }
    },
    async close() {
      await pg.close();
    },
  };
}

/** A fresh, migrated, empty database. */
export async function createTestDb(): Promise<Sql> {
  const pg = await new PGlite();
  const db = wrap(pg);
  await migrate(db);
  return db;
}

/** A migrated database persisted under `dir`, for local development. */
export async function createLocalDb(dir: string): Promise<Sql> {
  const pg = await PGlite.create(dir);
  const db = wrap(pg);
  await migrate(db);
  return db;
}
