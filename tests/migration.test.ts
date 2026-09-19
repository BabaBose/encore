import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '@/db/client';

/**
 * `schema.sql` only ever creates tables that do not exist, so a column added
 * after launch reaches an existing database through the additive migrations in
 * `migrate`. This is the check that they actually run.
 */
describe('additive migrations', () => {
  function columns(db: ReturnType<typeof openDatabase>, table: string): string[] {
    return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((r) => r.name);
  }

  it('adds a missing column to a database that predates it', () => {
    const db = openDatabase(':memory:');
    // The entertainers table as it stood before the residency setting existed:
    // the same columns the schema's indexes reference, minus the new one.
    db.exec(`CREATE TABLE entertainers (
      id TEXT PRIMARY KEY, user_id TEXT, managed_by_user_id TEXT, slug TEXT, stage_name TEXT,
      home_city_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT, updated_at TEXT
    )`);
    db.prepare(
      "INSERT INTO entertainers (id, user_id, slug, stage_name, created_at, updated_at) VALUES ('e1','u1','a','A','now','now')",
    ).run();
    expect(columns(db, 'entertainers')).not.toContain('residency_inquiry_policy');

    migrate(db);

    expect(columns(db, 'entertainers')).toContain('residency_inquiry_policy');
    // The existing row keeps working and takes the cautious default.
    const row = db.prepare('SELECT residency_inquiry_policy AS p FROM entertainers WHERE id = ?').get('e1') as {
      p: string;
    };
    expect(row.p).toBe('when_largely_free');
    db.close();
  });

  it('is idempotent — running it twice changes nothing', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const before = columns(db, 'entertainers');
    expect(() => migrate(db)).not.toThrow();
    expect(columns(db, 'entertainers')).toEqual(before);
    db.close();
  });
});
