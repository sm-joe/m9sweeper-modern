BEGIN;
CREATE TABLE IF NOT EXISTS managed_policies (
  cluster_id text NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  enforcement boolean NOT NULL DEFAULT true,
  scanners jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cluster_id,id)
);
CREATE TABLE IF NOT EXISTS policy_exceptions (
  cluster_id text NOT NULL,
  policy_id text NOT NULL,
  id text NOT NULL,
  title text NOT NULL,
  reason text NOT NULL,
  scanner_id text,
  cve text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cluster_id,policy_id,id),
  FOREIGN KEY(cluster_id,policy_id) REFERENCES managed_policies(cluster_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_exceptions_active ON policy_exceptions(cluster_id,policy_id,expires_at);
COMMIT;
