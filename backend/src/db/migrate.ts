import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';

// No schema reset. An advisory lock serializes upgrades across backend replicas.
// Initial migration remains bootstrapped by PostgreSQL initdb on the first installation.
export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(900157211)');
    const containerPath = join(process.cwd(),'migrations','002_policy_management.sql');
    const sourcePath = join(process.cwd(),'src','db','migrations','002_policy_management.sql');
    const sql = readFileSync(existsSync(containerPath) ? containerPath : sourcePath,'utf8');
    await client.query(sql);
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(900157211)'); } finally { client.release(); }
  }
}
