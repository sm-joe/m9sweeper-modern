import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {IExceptionCreate} from '../entities/IExceptionCreate';

@Injectable({
  providedIn: 'root'
})

export class ExceptionsService {
  constructor(private httpClient: HttpClient) {}

  createException(data: IExceptionCreate): Observable<any>{
    return this.httpClient.post('/api/exceptions/create', data);
  }
  getAllExceptions(): Observable<any>{
    return this.httpClient.get('/api/exceptions');
  }
  getExceptionById(id: number): Observable<any>{
    return this.httpClient.get(`/api/exceptions/${id}`);
  }
  deleteExceptionById(id: number): Observable<any>{
    return this.httpClient.delete(`api/exceptions/${id}`);
  }
  updateExceptionById(data: IExceptionCreate, id: number): Observable<any> {
    return this.httpClient.put(`api/exceptions/${id}`, data);
  }
}
