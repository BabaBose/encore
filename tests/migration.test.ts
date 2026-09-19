import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { migrate, type Sql } from '@/db/client';

/**
 * `schema.sql` only ever creates tables that do not exist, so a column added
 * after launch reaches an existing database through the additive migrations in
 * `migrate`. This is the check that they actually run.
 */
function wrap(pg: PGlite): Sql {
  return {
    async query<R>(text: string, params: unknown[] = []) {
      const result = await pg.query(text, params as never[]);
      return { rows: result.rows as R[] };
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
      return fn(wrap(pg));
    },
    async close() {
      await pg.close();
    },
  };
}

async function columns(db: Sql, table: string): Promise<string[]> {
  const { rows } = await db.query<{ column_name: string }>(
    'SELECT column_name FROM information_schema.columns WHERE table_name = $1',
    [table],
  );
  return rows.map((r) => r.column_name);
}

describe('additive migrations', () => {
  it('adds a missing column to a database that predates it', async () => {
    const pg = await new PGlite();
    const db = wrap(pg);

    // The entertainers table as it stood before the residency setting existed.
    await db.query(`CREATE TABLE entertainers (
      id TEXT PRIMARY KEY, user_id TEXT, managed_by_user_id TEXT, slug TEXT, stage_name TEXT,
      home_city_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT, updated_at TEXT
    )`);
    await db.query(
      "INSERT INTO entertainers (id, user_id, slug, stage_name, created_at, updated_at) VALUES ('e1','u1','a','A','now','now')",
    );
    expect(await columns(db, 'entertainers')).not.toContain('residency_inquiry_policy');

    await migrate(db);

    expect(await columns(db, 'entertainers')).toContain('residency_inquiry_policy');
    // The existing row keeps working and takes the cautious default.
    const { rows } = await db.query<{ p: string }>('SELECT residency_inquiry_policy AS p FROM entertainers WHERE id = $1', [
      'e1',
    ]);
    expect(rows[0].p).toBe('when_largely_free');
    await db.close();
  });

  it('is idempotent — running it twice changes nothing', async () => {
    const pg = await new PGlite();
    const db = wrap(pg);
    await migrate(db);
    const before = await columns(db, 'entertainers');
    await expect(migrate(db)).resolves.not.toThrow();
    expect(await columns(db, 'entertainers')).toEqual(before);
    await db.close();
  });
});
