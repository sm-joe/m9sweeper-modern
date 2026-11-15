import { Injectable } from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class KubesecService {

  constructor( private httpClient: HttpClient ) {}

  listNamespaces(clusterId: number): Observable<any> {
    return this.httpClient.get(`/api/kubesec/listnamespaces?clusterId=${clusterId}`);
  }

  listPods(clusterId: number, namespacesArray: string[]): Observable<any> {
    // Express query parsers differ in how they interpret namespaces[].
    // Send repeated plain "namespaces" keys; NestJS receives a string or array.
    const params = namespacesArray
      .filter(namespace => namespace !== 'selectAll')
      .reduce((query, namespace) => query.append('namespaces', namespace),
        new HttpParams().set('clusterId', String(clusterId)));
    return this.httpClient.get('/api/kubesec/listpods', {params});
  }

  getKubesecReport(info: any, clusterId: number): Observable<any> {
    return this.httpClient.post(`/api/kubesec/${clusterId}`, info);
  }

  getPodFileKubesecReport(podFile: FormData): Observable<any> {
    return this.httpClient.post('/api/kubesec', podFile);
  }
}
