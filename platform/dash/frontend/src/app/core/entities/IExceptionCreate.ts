/** Browser-only request shape for the exception API.
 * Do not import NestJS DTO classes into Angular: those bring in server decorators.
 * Keep field names aligned with the JSON accepted by the exceptions API.
 */
export interface IExceptionCreate {
  title: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
  scannerId: number;
  issueIdentifier: string;
  relevantForAllPolicies: boolean;
  relevantForAllClusters: boolean;
  relevantForAllKubernetesNamespaces: boolean;
  clusters: number[];
  policies: number[];
  namespaces: string[];
  type: string;
  imageMatch: string;
  isTempException: boolean;
  altSeverity: string;
}
