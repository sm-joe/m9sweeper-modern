import { Injectable } from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import {IKubeBenchReport, IKubeBenchSummary} from '../entities/IKubeBenchReport';

@Injectable({
  providedIn: 'root'
})
export class KubeBenchService {

  // Hold only reports returned by an authenticated cluster-scoped request.
  // Do not persist security findings in browser storage or navigation history.
  private cachedReports = new Map<number, IKubeBenchReport>();
  private cacheToken: string | null = null;

  constructor(private httpClient: HttpClient) { }

  private syncSession(): void {
    const token = localStorage.getItem('__token__');
    if (token !== this.cacheToken) {
      this.cachedReports.clear();
      this.cacheToken = token;
    }
  }

  getCachedReport(id: number): IKubeBenchReport | undefined {
    this.syncSession();
    return this.cachedReports.get(id);
  }


  // Some endpoints return the payload directly while others use the API envelope.
  // Normalize both shapes at the HTTP boundary so components consume one contract.
  getKubeBenchReportById(id: number): Observable<IKubeBenchReport> {
    return this.httpClient.get<IKubeBenchReport | {data: IKubeBenchReport}>(`/api/kube-bench/${id}`)
      .pipe(map(response => 'data' in response ? response.data : response));
  }

  getAllBenchReportsByCluster(clusterId: number, limit?: number, page?: number):
    Observable<{reportCount: number; list: IKubeBenchReport[]}> {
    let params = new HttpParams();
    if (limit !== undefined) params = params.set('limit', String(limit));
    if (page !== undefined) params = params.set('page', String(page));
    type ReportList = {reportCount: number; list: IKubeBenchReport[]};
    return this.httpClient.get<ReportList | {data: ReportList}>(`/api/kube-bench/cluster/${clusterId}`, {params})
      .pipe(
        map(response => 'data' in response ? response.data : response),
        tap(payload => {
          this.syncSession();
          for (const report of payload?.list || []) {
            if (Number.isSafeInteger(report.id) && report.id > 0) {
              this.cachedReports.set(report.id, report);
            }
          }
        })
      );
  }

  getConfigFileList(): Observable<{data: {name: string, value: string}[], success: boolean}> {
    return this.httpClient.get<{data: {name: string, value: string}[], success: boolean}>(`/api/kube-bench/config/get-options`);
  }

  getConfigFileContents(input: string): Observable<{data: string, success: boolean}> {
    return this.httpClient.get<{data: string, success: boolean}>(`/api/kube-bench/config/get-options/${input}`);
  }

  getLastBenchReportSummary(clusterId: number): Observable<IKubeBenchSummary>{
    return this.httpClient.get<IKubeBenchSummary>(`api/kube-bench/cluster/last/report/${clusterId}`);
  }

  deleteKubeBenchReportById(id: number): Observable<boolean> {
    return this.httpClient.delete<boolean>(`/api/kube-bench/${id}`);
  }
  getKubeBenchApiKey(): Observable<{api: string}[]> {
    return this.httpClient.get<{api: string}[]>(`/api/kube-bench/apiKey`);
  }
}
