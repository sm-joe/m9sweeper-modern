import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { KubeBenchService } from './kube-bench.service';

describe('KubeBenchService report contracts', () => {
  let service: KubeBenchService;
  let http: HttpTestingController;
  const report = {id: 37, clusterId: 3, resultsJson: {Controls: [{id: '1', tests: []}], Totals: {total_pass: 63, total_fail: 12, total_warn: 56, total_info: 0}}};
  const list = {reportCount: 1, list: [report]};

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(KubeBenchService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the direct list response returned by the existing API', () => {
    let actual: any;
    service.getAllBenchReportsByCluster(3, 20, 0).subscribe(value => actual = value);
    const request = http.expectOne('/api/kube-bench/cluster/3?limit=20&page=0');
    request.flush(list);
    expect(actual.reportCount).toBe(1);
    expect(actual.list[0].resultsJson.Controls.length).toBe(1);
  });

  it('also accepts an enveloped list response', () => {
    let actual: any;
    service.getAllBenchReportsByCluster(3).subscribe(value => actual = value);
    http.expectOne('/api/kube-bench/cluster/3').flush({success: true, message: '', data: list});
    expect(actual.list[0].clusterId).toBe(3);
  });

  it('reads direct report details', () => {
    let actual: any;
    service.getKubeBenchReportById(37).subscribe(value => actual = value);
    http.expectOne('/api/kube-bench/37').flush(report);
    expect(actual.resultsJson.Totals.total_pass).toBe(63);
  });

  it('reads enveloped report details', () => {
    let actual: any;
    service.getKubeBenchReportById(37).subscribe(value => actual = value);
    http.expectOne('/api/kube-bench/37').flush({success: true, message: '', data: report});
    expect(actual.resultsJson.Controls.length).toBe(1);
  });
});
