BEGIN;
CREATE TABLE IF NOT EXISTS clusters (
  id text PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS scan_runs (
  cluster_id text NOT NULL REFERENCES clusters(id), scan_id text NOT NULL,
  image_ref text NOT NULL, image_digest text, scanner text NOT NULL DEFAULT 'trivy',
  scanned_at timestamptz NOT NULL, status text NOT NULL CHECK(status IN ('complete','error')),
  severity_counts jsonb NOT NULL, raw_report jsonb NOT NULL,
  risk_value numeric, risk_algorithm text NOT NULL, risk_weights jsonb,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, scan_id)
);
CREATE TABLE IF NOT EXISTS vulnerabilities (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cluster_id text NOT NULL, scan_id text NOT NULL, image_ref text NOT NULL,
  target text NOT NULL, vulnerability_id text NOT NULL, package_name text NOT NULL,
  installed_version text NOT NULL, fixed_version text, severity text NOT NULL,
  is_fixable boolean NOT NULL, title text, primary_url text, raw jsonb NOT NULL,
  FOREIGN KEY (cluster_id,scan_id) REFERENCES scan_runs(cluster_id,scan_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_scan_cluster_time ON scan_runs(cluster_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS ix_scan_raw_gin ON scan_runs USING gin(raw_report jsonb_path_ops);
CREATE INDEX IF NOT EXISTS ix_vuln_cluster_scan ON vulnerabilities(cluster_id, scan_id);
CREATE TABLE IF NOT EXISTS cluster_risk_snapshots (
  cluster_id text NOT NULL REFERENCES clusters(id), snapshot_date date NOT NULL,
  risk_value numeric, algorithm text NOT NULL, severity_counts jsonb NOT NULL,
  coverage jsonb NOT NULL, PRIMARY KEY (cluster_id,snapshot_date,algorithm)
);
COMMIT;
