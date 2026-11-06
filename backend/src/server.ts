import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { processTrivyBatch } from './processors/trivy-processor.js';
import { savePreparedScan } from './db/save-trivy.js';
import type { TrawlerPayload } from './contracts/trivy.js';

const port = Number(process.env.PORT ?? 8080);
const token = process.env.M9_AGENT_API_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!token || token.length < 32) throw new Error('M9_AGENT_API_KEY must be at least 32 characters');
if (!dbUrl) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: dbUrl, max: 10, connectionTimeoutMillis: 5000 });

function authorized(req: IncomingMessage): boolean {
  const candidate = req.headers.authorization?.replace(/^Bearer /i, '') ?? '';
  const a = Buffer.from(candidate);
  const b = Buffer.from(token!);
  return a.length === b.length && timingSafeEqual(a,b);
}
function respond(res: ServerResponse, code: number, data: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += b.length;
    if (length > 8 * 1024 * 1024) throw new Error('Payload exceeds 8 MiB');
    chunks.push(b);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const server = createServer(async (req, res) => {
  if (req.url === '/healthz') return respond(res, 200, { status: 'alive' });
  if (req.url === '/readyz') {
    try { await pool.query('SELECT 1'); return respond(res, 200, { status: 'ready' }); }
    catch { return respond(res, 503, { error: 'database unavailable' }); }
  }
  if (!authorized(req)) return respond(res, 401, { error: 'unauthorized' });
  try {
    if (req.method === 'POST' && req.url === '/v1/scans') {
      const input = await body(req);
      const scans = processTrivyBatch(input as TrawlerPayload[]);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const scan of scans) {
          await client.query('INSERT INTO clusters(id,name) VALUES ($1,$1) ON CONFLICT (id) DO NOTHING', [scan.clusterId]);
          await savePreparedScan(client, scan);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
      return respond(res, 201, { accepted: scans.length, scanIds: scans.map(s => s.scanId) });
    }
    if (req.method === 'GET' && req.url === '/v1/clusters') {
      const result = await pool.query('SELECT id,name,created_at FROM clusters ORDER BY created_at DESC');
      return respond(res, 200, { data: result.rows });
    }
    if (req.method === 'GET' && req.url === '/v1/scans') {
      const result = await pool.query(`SELECT cluster_id,scan_id,image_ref,image_digest,scanned_at,status,severity_counts,risk_value,risk_algorithm
        FROM scan_runs ORDER BY scanned_at DESC, inserted_at DESC LIMIT 100`);
      return respond(res, 200, { data: result.rows });
    }
    if (req.method === 'GET' && req.url?.startsWith('/v1/vulnerabilities?')) {
      const id = new URL(req.url, 'http://localhost').searchParams.get('scanId');
      if (!id) return respond(res, 400, { error: 'scanId is required' });
      const result = await pool.query(`SELECT cluster_id,scan_id,image_ref,target,vulnerability_id,package_name,
        installed_version,fixed_version,severity,is_fixable,title,primary_url
        FROM vulnerabilities WHERE scan_id=$1 ORDER BY id LIMIT 500`, [id]);
      return respond(res, 200, { data: result.rows });
    }
    return respond(res, 404, { error: 'not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    const badInput = /Payload|JSON|must be|Invalid|Malformed|Duplicate|Expected/i.test(message);
    if (!badInput) console.error('Request failed', error);
    return respond(res, badInput ? 400 : 500, { error: badInput ? message : 'internal error' });
  }
});
server.listen(port, '0.0.0.0', () => console.log(`m9 backend listening on ${port}`));
function shutdown() { server.close(() => pool.end().finally(() => process.exit(0))); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
