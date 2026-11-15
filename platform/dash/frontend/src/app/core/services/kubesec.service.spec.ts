import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting, HttpTestingController} from '@angular/common/http/testing';
import {KubesecService} from './kubesec.service';

describe('KubesecService', () => {
  let service: KubesecService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(KubesecService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends a scoped namespace lookup', () => {
    service.listNamespaces(7).subscribe();
    const req = http.expectOne('/api/kubesec/listnamespaces?clusterId=7');
    expect(req.request.method).toBe('GET');
    req.flush({items: []});
  });

  it('serializes repeated namespace values without special selectAll marker', () => {
    service.listPods(7, ['default', 'kube-system', 'selectAll']).subscribe();
    const req = http.expectOne(request => request.url === '/api/kubesec/listpods');
    expect(req.request.params.get('clusterId')).toBe('7');
    expect(req.request.params.getAll('namespaces')).toEqual(['default', 'kube-system']);
    expect(req.request.params.has('namespaces[]')).toBeFalse();
    req.flush([]);
  });
});
