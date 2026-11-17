import { Injectable } from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {IKubeHunterReport} from '../entities/IKubeHunterReport';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {IServerResponse} from '../entities/IServerResponse';

@Injectable({
  providedIn: 'root'
})
export class KubeHunterService {

  constructor(private httpClient: HttpClient) { }

  // All kube-hunter endpoints use the NestJS response transformer, which wraps
  // payloads as {success, message, data}. Normalize at the HTTP boundary.
  private unwrap<T>(response: T | {success: boolean; data: T; message?: string}): T {
    if (response && typeof response === 'object' && 'success' in response) {
      if (!response.success || !('data' in response)) {
        throw new Error(response.message || 'Kube-hunter API returned an unsuccessful response');
      }
      return response.data;
    }
    return response as T;
  }

  getKubeHunterReportById(id: number): Observable<IKubeHunterReport> {
    return this.httpClient
      .get<IKubeHunterReport | {success: boolean; data: IKubeHunterReport}>(`/api/kubehunter/${id}`)
      .pipe(map(response => this.unwrap(response)));
  }

  getRecentKubehunterScan(clusterId: number, minDate?: number): Observable<IKubeHunterReport> {
    let params: HttpParams;
    if (minDate) {
      params = new HttpParams({ fromObject: { minDate: String(minDate) }});
    }
    return this.httpClient.get<IKubeHunterReport | {success: boolean; data: IKubeHunterReport}>(`/api/kubehunter/cluster/${clusterId}/recent`, { params })
      .pipe(map(response => this.unwrap(response)));
  }

  allReportsForCluster(clusterId: number, limit?: number, page?: number):
    Observable<{reportCount: number, list: IKubeHunterReport[]}>{
    let params: HttpParams = new HttpParams();
    params = params.set('limit', String(limit));
    params = params.set('page', String(page));
    type ReportList = {reportCount: number; list: IKubeHunterReport[]};
    return this.httpClient.get<ReportList | {success: boolean; data: ReportList}>(`/api/kubehunter/cluster/${clusterId}`, {params})
      .pipe(map(response => this.unwrap(response)));
  }

  getKubeHunterApiKey(): Observable<{api: string}[]> {
    return this.httpClient.get<{api: string}[]>(`/api/kubehunter/apiKey`);
  }

}
