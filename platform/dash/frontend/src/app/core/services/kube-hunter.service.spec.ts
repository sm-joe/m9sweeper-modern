import {TestBed} from '@angular/core/testing';
import {HttpClientTestingModule, HttpTestingController} from '@angular/common/http/testing';
import {KubeHunterService} from './kube-hunter.service';

describe('KubeHunterService API response contracts', () => {
  let service: KubeHunterService;
  let http: HttpTestingController;
  const report: any = {
    id: 9, clusterId: 3, createdAt: 1794729909000,
    vulnerabilities: {value: {value: []}},
  };
  const list = {reportCount: 1, list: [report]};

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(KubeHunterService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('unwraps the NestJS report detail response', () => {
    let actual: any;
    service.getKubeHunterReportById(9).subscribe(result => actual = result);
    http.expectOne('/api/kubehunter/9').flush({success: true, message: '', data: report});
    expect(actual.id).toBe(9);
    expect(actual.clusterId).toBe(3);
  });

  it('unwraps the NestJS paginated cluster report list', () => {
    let actual: any;
    service.allReportsForCluster(3, 20, 0).subscribe(result => actual = result);
    http.expectOne('/api/kubehunter/cluster/3?limit=20&page=0')
      .flush({success: true, message: '', data: list});
    expect(actual.reportCount).toBe(1);
    expect(actual.list[0].id).toBe(9);
  });

  it('supports bare legacy report responses', () => {
    let actual: any;
    service.getKubeHunterReportById(9).subscribe(result => actual = result);
    http.expectOne('/api/kubehunter/9').flush(report);
    expect(actual.id).toBe(9);
  });

  it('does not silently treat a failed response as a clean scan', () => {
    let failure: Error;
    service.getKubeHunterReportById(9).subscribe({error: err => failure = err});
    http.expectOne('/api/kubehunter/9')
      .flush({success: false, message: 'Unable to load report', data: null});
    expect(failure.message).toContain('Unable to load report');
  });
});
