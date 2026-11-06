import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';

// No schema reset. An advisory lock serializes upgrades across backend replicas.
// Initial migration remains bootstrapped by PostgreSQL initdb on the first installation.
export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(900157211)');
    const sql = readFileSync(join(process.cwd(),'migrations','002_policy_management.sql'),'utf8');
    await client.query(sql);
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(900157211)'); } finally { client.release(); }
  }
}
