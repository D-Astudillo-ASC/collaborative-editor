// PREVIOUS IMPLEMENTATION (commented out):
// - Migrations assumed DATABASE_URL was already present in the environment.
//
// Reason for change:
// - When running `pnpm -C server run migrate`, we want Node to load `server/.env` automatically
//   so DATABASE_URL is available without requiring you to export it in your shell.
//
// const fs = require('fs');
// const path = require('path');
// const { getPool } = require('./pool');

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getPool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

function listSqlMigrations(migrationsDir) {
  const files = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.sql'))
    .map((d) => d.name)
    .sort();
  return files;
}

async function getAppliedMigrationIds(client) {
  const res = await client.query('select id from schema_migrations order by id asc;');
  return new Set(res.rows.map((r) => r.id));
}

async function applyMigration(client, id, sql) {
  await client.query('begin;');
  try {
    await client.query(sql);
    await client.query('insert into schema_migrations(id) values ($1);', [id]);
    await client.query('commit;');
  } catch (e) {
    await client.query('rollback;');
    throw e;
  }
}

async function migrate() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrationIds(client);
    const migrations = listSqlMigrations(migrationsDir);

    for (const file of migrations) {
      if (applied.has(file)) continue;
      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8');
      // eslint-disable-next-line no-console
      console.log(`🧱 Applying migration ${file}...`);
      await applyMigration(client, file, sql);
      // eslint-disable-next-line no-console
      console.log(`✅ Applied migration ${file}`);
    }
  } finally {
    client.release();
  }
}

export { migrate };

