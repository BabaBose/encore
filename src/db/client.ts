/**
 * SQLite connection.
 *
 * One file-backed database, opened once per process. SQLite keeps the whole
 * platform runnable with `npm run seed && npm run dev` — no service to stand
 * up — while still being a real relational store with foreign keys enforced.
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Db = Database.Database;

const DEFAULT_PATH = join(process.cwd(), 'data', 'encore.db');

let instance: Db | null = null;

export function openDatabase(path: string = process.env.ENCORE_DB_PATH ?? DEFAULT_PATH): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Columns added after a table first shipped.
 *
 * `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so it builds a new database
 * correctly but never touches an existing one. These run afterwards and are
 * additive and idempotent: each is applied only if the column is genuinely
 * missing, so a database created today skips all of them.
 */
const ADDED_COLUMNS: Array<{ table: string; column: string; definition: string }> = [
  {
    table: 'entertainers',
    column: 'residency_inquiry_policy',
    definition: "TEXT NOT NULL DEFAULT 'when_largely_free'",
  },
];

function columnExists(db: Db, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

export function migrate(db: Db): void {
  const schema = readFileSync(join(process.cwd(), 'src', 'db', 'schema.sql'), 'utf8');
  db.exec(schema);

  for (const { table, column, definition } of ADDED_COLUMNS) {
    if (columnExists(db, table, column)) continue;
    // SQLite cannot add a column with a CHECK constraint, so the enum is
    // enforced by the domain and by schema.sql for freshly created databases.
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** The shared connection used by the app. Migrates on first open. */
export function getDb(): Db {
  if (!instance) {
    instance = openDatabase();
    migrate(instance);
  }
  return instance;
}

/** A fresh in-memory database, for tests. */
export function createTestDb(): Db {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
}
