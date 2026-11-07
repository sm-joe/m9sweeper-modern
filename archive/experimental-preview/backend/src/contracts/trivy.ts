export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NEGLIGIBLE' | 'UNKNOWN';
export type CountedSeverity = Exclude<Severity, 'UNKNOWN'>;
export interface TrivyVulnerability {
  VulnerabilityID: string;
  PkgName?: string;
  InstalledVersion?: string;
  FixedVersion?: string;
  Severity?: string;
  Title?: string;
  PrimaryURL?: string;
  [property: string]: unknown;
}
export interface TrivyReport {
  ArtifactName?: string;
  ArtifactType?: string;
  Metadata?: { RepoDigests?: string[]; ImageID?: string };
  Results?: Array<{ Target?: string; Class?: string; Type?: string; Vulnerabilities?: TrivyVulnerability[] }>;
  [property: string]: unknown;
}
export interface TrawlerPayload {
  clusterId: string;
  scanId: string;
  image: string;
  scannedAt: string;
  report: TrivyReport;
}
export interface VulnerabilityRow {
  clusterId: string; scanId: string; image: string; target: string;
  vulnerabilityId: string; packageName: string; installedVersion: string;
  fixedVersion: string | null; severity: Severity; isFixable: boolean;
  title: string | null; primaryUrl: string | null; raw: TrivyVulnerability;
}
export interface Counts { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number; NEGLIGIBLE: number; UNKNOWN: number }
export interface PreparedScan {
  clusterId: string; scanId: string; image: string; imageDigest: string | null;
  scannedAt: string; status: 'complete'; counts: Counts;
  risk: { value: number | null; algorithm: string; weights: Record<CountedSeverity, number> | null };
  vulnerabilities: VulnerabilityRow[]; rawReport: TrivyReport;
}
