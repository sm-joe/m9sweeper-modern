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
    const route: any = {parent: {snapshot: {paramMap: convertToParamMap({id: '3'})}}, paramMap: of(convertToParamMap({id: reportId}))};
    const service: any = {
      getKubeBenchReportById: jasmine.createSpy('getKubeBenchReportById').and.returnValue(of(response)),
      getCachedReport: jasmine.createSpy('getCachedReport').and.returnValue(undefined)
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
    const route: any = {parent: {snapshot: {paramMap: convertToParamMap({id: '3'})}}, paramMap: of(convertToParamMap({id: '37'}))};
    const service: any = {
      getKubeBenchReportById: () => throwError({status: 403}),
      getCachedReport: () => undefined,
    };
    const component = new KubeBenchReportDetailsComponent(route, service);
    component.ngOnInit();
    expect(component.loading).toBeFalse();
    expect(component.loadError).toContain('HTTP 403');
  });

  it('renders the already-authorized audit without another HTTP request', () => {
    const route: any = {
      parent: {snapshot: {paramMap: convertToParamMap({id: '3'})}},
      paramMap: of(convertToParamMap({id: '37'}))
    };
    const service: any = {
      getCachedReport: jasmine.createSpy('getCachedReport').and.returnValue(report),
      getKubeBenchReportById: jasmine.createSpy('getKubeBenchReportById')
    };
    const component = new KubeBenchReportDetailsComponent(route, service);
    component.ngOnInit();
    expect(component.report.Totals.total_pass).toBe(63);
    expect(component.loading).toBeFalse();
    expect(service.getKubeBenchReportById).not.toHaveBeenCalled();
  });

  it('rejects a cached report belonging to another cluster', () => {
    const route: any = {
      parent: {snapshot: {paramMap: convertToParamMap({id: '4'})}},
      paramMap: of(convertToParamMap({id: '37'}))
    };
    const service: any = {
      getCachedReport: () => report,
      getKubeBenchReportById: jasmine.createSpy('getKubeBenchReportById').and.returnValue(of(report))
    };
    const component = new KubeBenchReportDetailsComponent(route, service);
    component.ngOnInit();
    expect(service.getKubeBenchReportById).toHaveBeenCalledWith(37);
  });

  it('rejects an invalid audit ID without an API call', () => {
    const {component, service} = create('invalid');
    expect(service.getKubeBenchReportById).not.toHaveBeenCalled();
    expect(component.loading).toBeFalse();
    expect(component.loadError).toContain('Invalid kube-bench');
  });
});
