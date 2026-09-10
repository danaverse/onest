/**
 * SQLite connection + migrations for the Onest social store.
 * One writer process (dana-index); WAL allows concurrent API reads.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type SocialDb = BetterSQLite3Database<typeof schema>;

export interface OpenedSocialDb {
  sqlite: Database.Database;
  db: SocialDb;
}

export function socialMigrationsFolder(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');
}

export function openSocialDb(
  dbPath: string,
  opts?: { migrate?: boolean },
): OpenedSocialDb {
  const target = dbPath === ':memory:' ? dbPath : resolve(dbPath);
  if (target !== ':memory:') {
    mkdirSync(dirname(target), { recursive: true });
  }
  const sqlite = new Database(target);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  if (opts?.migrate !== false) {
    migrate(db, { migrationsFolder: socialMigrationsFolder() });
  }
  return { sqlite, db };
}
