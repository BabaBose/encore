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

export function migrate(db: Db): void {
  const schema = readFileSync(join(process.cwd(), 'src', 'db', 'schema.sql'), 'utf8');
  db.exec(schema);
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
