/**
 * SQLite connection.
 *
 * One file-backed database, opened once per process. SQLite keeps the whole
 * platform runnable with `npm run seed && npm run dev` — no service to stand
 * up — while still being a real relational store with foreign keys enforced.
 *
 * ## Running on a serverless host
 *
 * A serverless filesystem is read-only apart from `/tmp`, so the database
 * cannot live beside the code there. In `ephemeral` mode the build's seeded
 * database is copied into `/tmp` on cold start and opened from there.
 *
 * That makes the deployment a working demo, not a production store: `/tmp` is
 * per-instance and is reclaimed when the instance is, so writes are not shared
 * between instances and do not survive. Real durable storage means a hosted
 * database — see README.
 */
import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Db = Database.Database;

const DEFAULT_PATH = join(process.cwd(), 'data', 'booktheact.db');

/** The seeded database the build produces, carried into the bundle. */
const BUNDLED_SEED = join(process.cwd(), 'data', 'booktheact.db');

const EPHEMERAL_PATH = '/tmp/booktheact.db';

let instance: Db | null = null;

/**
 * `ephemeral` is set explicitly, or inferred on Vercel where nothing else can
 * work. Anywhere else the database is an ordinary file that persists.
 */
export function isEphemeral(): boolean {
  if (process.env.BOOKTHEACT_DB_MODE === 'ephemeral') return true;
  if (process.env.BOOKTHEACT_DB_MODE === 'persistent') return false;
  return process.env.VERCEL === '1';
}

function resolvePath(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.BOOKTHEACT_DB_PATH) return process.env.BOOKTHEACT_DB_PATH;
  return isEphemeral() ? EPHEMERAL_PATH : DEFAULT_PATH;
}

export function openDatabase(path?: string): Db {
  const target = resolvePath(path);

  if (target !== ':memory:') {
    mkdirSync(dirname(target), { recursive: true });
    // On a cold start there is nothing in /tmp yet: lay down the build's seeded
    // copy so the instance comes up with the demo marketplace already in it.
    if (target === EPHEMERAL_PATH && !existsSync(target) && existsSync(BUNDLED_SEED)) {
      copyFileSync(BUNDLED_SEED, target);
    }
  }

  const db = new Database(target);
  // WAL needs to write a sidecar next to the database. That is fine in /tmp and
  // on a normal disk, but never on the read-only part of a serverless bundle.
  db.pragma(target === ':memory:' ? 'journal_mode = MEMORY' : 'journal_mode = WAL');
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

/**
 * `schema.sql` is read relative to this module, not the working directory:
 * a serverless bundle has no `src/` tree, but `next.config.mjs` traces the file
 * in next to the compiled module.
 */
function readSchema(): string {
  const candidates = [
    join(process.cwd(), 'src', 'db', 'schema.sql'),
    join(import.meta.dirname ?? __dirname, 'schema.sql'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
  }
  throw new Error(`Could not find schema.sql — looked in ${candidates.join(', ')}`);
}

export function migrate(db: Db): void {
  db.exec(readSchema());

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
