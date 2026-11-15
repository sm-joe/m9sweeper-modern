import {convertToParamMap} from '@angular/router';
import {of, throwError} from 'rxjs';
import {KubeBenchReportDetailsComponent} from './kube-bench-report-details.component';

describe('KubeBenchReportDetailsComponent', () => {
  const report: any = {
    id: 37,
    clusterId: 3,
    resultsJson: {
      Controls: [{id: '1', text: 'Control Plane Security Configuration', tests: []}],
      Totals: {total_pass: 63, total_fail: 12, total_warn: 56, total_info: 0}
    }
  };

  function create(reportId = '37', response: any = report) {
    const route: any = {paramMap: of(convertToParamMap({id: reportId}))};
    const service: any = {
      getKubeBenchReportById: jasmine.createSpy('getKubeBenchReportById').and.returnValue(of(response))
    };
    const component = new KubeBenchReportDetailsComponent(route, service);
    component.ngOnInit();
    return {component, service};
  }

  it('loads the clicked report by its own ID, matching the upstream behavior', () => {
    const {component, service} = create();
    expect(service.getKubeBenchReportById).toHaveBeenCalledWith(37);
    expect(component.report.Controls.length).toBe(1);
    expect(component.report.Totals.total_pass).toBe(63);
    expect(component.loading).toBeFalse();
    expect(component.loadError).toBe('');
  });

  it('does not accept a malformed or empty report', () => {
    const {component} = create('37', {id: 37, resultsJson: {Controls: []}});
    expect(component.report).toBeUndefined();
    expect(component.loading).toBeFalse();
    expect(component.loadError).toContain('no readable CIS controls');
  });

  it('shows HTTP errors rather than an empty audit', () => {
    const route: any = {paramMap: of(convertToParamMap({id: '37'}))};
    const service: any = {
      getKubeBenchReportById: () => throwError({status: 403}),
    };
    const component = new KubeBenchReportDetailsComponent(route, service);
    component.ngOnInit();
    expect(component.loading).toBeFalse();
    expect(component.loadError).toContain('HTTP 403');
  });

  it('rejects an invalid audit ID without an API call', () => {
    const {component, service} = create('invalid');
    expect(service.getKubeBenchReportById).not.toHaveBeenCalled();
    expect(component.loading).toBeFalse();
    expect(component.loadError).toContain('Invalid kube-bench');
  });
});
