import {convertToParamMap} from '@angular/router';
import {of, throwError} from 'rxjs';
import {KubeBenchReportDetailsComponent} from './kube-bench-report-details.component';

describe('KubeBenchReportDetailsComponent', () => {
  const report = {
    id: 37,
    clusterId: 3,
    resultsJson: {
      Controls: [{id: '1', text: 'Control Plane Security Configuration', tests: []}],
      Totals: {total_pass: 63, total_fail: 12, total_warn: 56, total_info: 0}
    }
  };

  function create(reportId = '37', response: any = {reportCount: 1, list: [report]}) {
    const route: any = {
      parent: {snapshot: {paramMap: convertToParamMap({id: '3'})}},
      paramMap: of(convertToParamMap({id: reportId})),
    };
    const service: any = {
      getAllBenchReportsByCluster: jasmine.createSpy('getAllBenchReportsByCluster')
        .and.returnValue(of(response)),
    };
    const component = new KubeBenchReportDetailsComponent(route, service);
    component.ngOnInit();
    return {component, service};
  }

  it('renders controls for the selected audit from the working cluster report API', () => {
    const {component, service} = create();
    expect(service.getAllBenchReportsByCluster).toHaveBeenCalledWith(3, 100, 0);
    expect(component.report.Controls.length).toBe(1);
    expect(component.report.Totals.total_pass).toBe(63);
    expect(component.loading).toBeFalse();
    expect(component.loadError).toBe('');
  });

  it('never uses another report in place of the selected audit', () => {
    const {component} = create('36');
    expect(component.report).toBeUndefined();
    expect(component.loadError).toContain('no readable CIS controls');
  });

  it('reports API failures instead of silently rendering an empty page', () => {
    const route: any = {
      parent: {snapshot: {paramMap: convertToParamMap({id: '3'})}},
      paramMap: of(convertToParamMap({id: '37'})),
    };
    const service: any = {
      getAllBenchReportsByCluster: () => throwError({status: 403}),
    };
    const component = new KubeBenchReportDetailsComponent(route, service);
    component.ngOnInit();
    expect(component.loading).toBeFalse();
    expect(component.loadError).toContain('HTTP 403');
  });
});
