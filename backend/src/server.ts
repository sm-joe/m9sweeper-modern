import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { processTrivyBatch } from './processors/trivy-processor.js';
import { savePreparedScan } from './db/save-trivy.js';
import type { TrawlerPayload } from './contracts/trivy.js';
import { assessImageCompliance, type PolicyInput } from './legacy-salvage/image-compliance.js';
import { validatePolicy, validateException, putPolicy, putException, loadPolicy, loadCurrentExceptions } from './policies/policy-store.js';
import { migrate } from './db/migrate.js';

const port = Number(process.env.PORT ?? 8080);
const token = process.env.M9_AGENT_API_KEY;
const dbUrl = process.env.DATABASE_URL;
const adminToken = process.env.M9_ADMIN_API_KEY;
if (!adminToken || adminToken.length < 32 || adminToken === token) throw new Error('M9_ADMIN_API_KEY must be distinct from the agent key and >=32 characters');
if (!token || token.length < 32) throw new Error('M9_AGENT_API_KEY must be at least 32 characters');
if (!dbUrl) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: dbUrl, max: 10, connectionTimeoutMillis: 5000 });

function hasKey(req: IncomingMessage, expected: string): boolean {
  const candidate = req.headers.authorization?.replace(/^Bearer /i, '') ?? '';
  const a = Buffer.from(candidate); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a,b);
}
function authorized(req: IncomingMessage): boolean { return hasKey(req, token!) || hasKey(req, adminToken!); }
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
      if (!hasKey(req, token!)) return respond(res, 403, {error:'Agent permission required'});
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
    if (req.method === 'PUT' && req.url === '/v1/clusters') {
      if (!hasKey(req,adminToken!)) return respond(res,403,{error:'Admin permission required'});
      const item = await body(req) as {id?:unknown;name?:unknown};
      if (typeof item?.id!=='string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(item.id) ||
          typeof item.name!=='string' || item.name.trim().length<1 || item.name.length>200)
        return respond(res,400,{error:'Valid cluster id and name required'});
      await pool.query('INSERT INTO clusters(id,name) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name',
        [item.id,item.name.trim()]);
      return respond(res,200,{data:{id:item.id,name:item.name.trim()}});
    }
    if (req.method === 'GET' && req.url?.startsWith('/v1/policies?')) {
      const clusterId = new URL(req.url, 'http://localhost').searchParams.get('clusterId');
      if (!clusterId || clusterId.length > 128) return respond(res,400,{error:'clusterId is required'});
      const result=await pool.query('SELECT id,cluster_id,name,enabled,enforcement,scanners,created_at,updated_at FROM managed_policies WHERE cluster_id=$1 ORDER BY name',[clusterId]);
      return respond(res,200,{data:result.rows});
    }
    if (req.method === 'PUT' && req.url?.startsWith('/v1/policies?')) {
      if (!hasKey(req,adminToken!)) return respond(res,403,{error:'Admin permission required'});
      const clusterId = new URL(req.url,'http://localhost').searchParams.get('clusterId');
      if (!clusterId || clusterId.length>128) return respond(res,400,{error:'clusterId is required'});
      try {
        const policy=validatePolicy(await body(req),clusterId);
        const cluster=await pool.query('SELECT id FROM clusters WHERE id=$1',[clusterId]);
        if (cluster.rowCount!==1) return respond(res,404,{error:'cluster not found'});
        await putPolicy(pool,policy);
        return respond(res,200,{data:policy});
      } catch(e) {return respond(res,400,{error:e instanceof Error?e.message:'Invalid policy'});}
    }
    if (req.method === 'DELETE' && req.url?.startsWith('/v1/policies?')) {
      if (!hasKey(req,adminToken!)) return respond(res,403,{error:'Admin permission required'});
      const params=new URL(req.url,'http://localhost').searchParams;
      const clusterId=params.get('clusterId'),policyId=params.get('policyId');
      if(!clusterId||!policyId||clusterId.length>128||!/^[A-Za-z0-9_-]{1,80}$/.test(policyId))
        return respond(res,400,{error:'clusterId and valid policyId are required'});
      const result=await pool.query('DELETE FROM managed_policies WHERE cluster_id=$1 AND id=$2 RETURNING id',[clusterId,policyId]);
      return respond(res,result.rowCount===1?200:404,result.rowCount===1?{deleted:true}:{error:'policy not found'});
    }
    if (req.method === 'GET' && req.url?.startsWith('/v1/policy-exceptions?')) {
      const params = new URL(req.url,'http://localhost').searchParams;
      const clusterId=params.get('clusterId'),policyId=params.get('policyId');
      if (!clusterId || !policyId || clusterId.length>128 || policyId.length>80) return respond(res,400,{error:'clusterId and policyId are required'});
      const result=await pool.query('SELECT id,title,reason,scanner_id,cve,expires_at,created_at FROM policy_exceptions WHERE cluster_id=$1 AND policy_id=$2 ORDER BY created_at DESC',[clusterId,policyId]);
      return respond(res,200,{data:result.rows});
    }
    if (req.method === 'PUT' && req.url?.startsWith('/v1/policy-exceptions?')) {
      if (!hasKey(req,adminToken!)) return respond(res,403,{error:'Admin permission required'});
      const params=new URL(req.url,'http://localhost');
      const clusterId=params.searchParams.get('clusterId'),policyId=params.searchParams.get('policyId');
      if (!clusterId || !policyId || clusterId.length>128 || policyId.length>80) return respond(res,400,{error:'clusterId and policyId are required'});
      const policy=await loadPolicy(pool,clusterId,policyId);
      if (!policy) return respond(res,404,{error:'policy not found'});
      try {
        const exception=validateException(await body(req),clusterId,policyId);
        await putException(pool,exception);
        return respond(res,200,{data:exception});
      } catch(e) {return respond(res,400,{error:e instanceof Error?e.message:'Invalid exception'});}
    }
    if (req.method === 'DELETE' && req.url?.startsWith('/v1/policy-exceptions?')) {
      if (!hasKey(req,adminToken!)) return respond(res,403,{error:'Admin permission required'});
      const params=new URL(req.url,'http://localhost').searchParams;
      const clusterId=params.get('clusterId'),policyId=params.get('policyId'),exceptionId=params.get('exceptionId');
      if(!clusterId||!policyId||!exceptionId||clusterId.length>128||policyId.length>80||exceptionId.length>80)
        return respond(res,400,{error:'clusterId, policyId, exceptionId required'});
      const result=await pool.query('DELETE FROM policy_exceptions WHERE cluster_id=$1 AND policy_id=$2 AND id=$3 RETURNING id',
        [clusterId,policyId,exceptionId]);
      return respond(res,result.rowCount===1?200:404,result.rowCount===1?{deleted:true}:{error:'exception not found'});
    }
    // Authenticated, read-only compliance evaluation of persisted scan evidence.
    // Caller supplies a policy snapshot; never grants admission or persists an allow decision.
    if (req.method === 'POST' && req.url === '/v1/compliance/evaluate') {
      const input = await body(req) as { clusterId?: string; scanId?: string; policyId?: string };
      if (!input || typeof input.clusterId !== 'string' || typeof input.scanId !== 'string' ||
          input.clusterId.length > 128 || input.scanId.length > 128) {
        return respond(res, 400, { error: 'clusterId and scanId required' });
      }
      const scan = await pool.query('SELECT status FROM scan_runs WHERE cluster_id=$1 AND scan_id=$2',
        [input.clusterId, input.scanId]);
      if (scan.rows.length !== 1) return respond(res, 404, { error: 'scan not found' });
      const findingsResult = await pool.query(
        'SELECT vulnerability_id, severity, is_fixable FROM vulnerabilities WHERE cluster_id=$1 AND scan_id=$2',
        [input.clusterId, input.scanId]);
      const findings = findingsResult.rows.map(row => ({
        scannerId: 'trivy', cve: String(row.vulnerability_id), severity: String(row.severity), fixable: Boolean(row.is_fixable)
      }));
      try {
        if (typeof input.policyId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.policyId)) {
          return respond(res,400,{error:'policyId is required; inline policies are no longer accepted'});
        }
        const policy=await loadPolicy(pool,input.clusterId,input.policyId);
        if(!policy) return respond(res,404,{error:'managed policy not found'});
        const exceptions=await loadCurrentExceptions(pool,input.clusterId,input.policyId);
        const decision = assessImageCompliance({
          policy: {id:policy.id,name:policy.name,enabled:policy.enabled,enforcement:policy.enforcement},
          scanners: policy.scanners, exceptions,
          findings, scanError: scan.rows[0].status !== 'complete'
        });
        return respond(res, 200, { ...decision, evidence: { clusterId: input.clusterId, scanId: input.scanId, findingCount: findings.length },
          mode: 'evaluation-only', enforced: false });
      } catch (error) {
        return respond(res, 400, { error: error instanceof Error ? error.message : 'Invalid policy' });
      }
    }
    if (req.method === 'GET' && req.url?.startsWith('/v1/scan-detail?')) {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const clusterId = params.get('clusterId'); const scanId = params.get('scanId');
      if (!clusterId || !scanId || clusterId.length > 128 || scanId.length > 128) {
        return respond(res, 400, { error: 'clusterId and scanId are required' });
      }
      const scan = await pool.query(
        `SELECT cluster_id,scan_id,image_ref,image_digest,scanned_at,status,severity_counts,risk_value,risk_algorithm
         FROM scan_runs WHERE cluster_id=$1 AND scan_id=$2`, [clusterId,scanId]);
      if (scan.rows.length === 0) return respond(res, 404, { error: 'scan not found' });
      const findings = await pool.query(
        `SELECT target,vulnerability_id,package_name,installed_version,fixed_version,severity,is_fixable,title,primary_url
         FROM vulnerabilities WHERE cluster_id=$1 AND scan_id=$2 ORDER BY
         CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END,
         vulnerability_id LIMIT 500`, [clusterId,scanId]);
      return respond(res, 200, { scan: scan.rows[0], findings: findings.rows, limit: 500 });
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
migrate(pool).then(() => server.listen(port, '0.0.0.0', () => console.log(`m9 backend listening on ${port}`))).catch(err => { console.error('Migration failed', err); process.exitCode=1; void pool.end(); });
function shutdown() { server.close(() => pool.end().finally(() => process.exit(0))); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
