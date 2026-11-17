import {convertToParamMap} from '@angular/router';
import {NEVER, of, throwError} from 'rxjs';
import {fakeAsync, tick} from '@angular/core/testing';
import {KubeHunterReportDetailsComponent} from './kube-hunter-report-details.component';

describe('KubeHunterReportDetailsComponent', () => {
  const vuln = {location: 'worker-1', severity: 'high', category: 'Exposure', vulnerability: 'Example',
    description: 'Confirmed finding'};
  const report: any = {
    id: 9,
    clusterId: 3,
    createdAt: 1794729909000,
    vulnerabilities: JSON.stringify({value: {value: [vuln]}})
  };

  function create(response: any = report, fail = false, never = false) {
    const route: any = {snapshot: {paramMap: convertToParamMap({id: '9'})}};
    const service: any = {getKubeHunterReportById: jasmine.createSpy('getKubeHunterReportById')
      .and.returnValue(never ? NEVER : (fail ? throwError({status: 403}) : of(response)))};
    const clusters: any = {getClusterById: jasmine.createSpy('getClusterById')
      .and.returnValue(of({data: {id: 3, name: 'kind-local'}}))};
    const changeDetector: any = {markForCheck: jasmine.createSpy('markForCheck')};
    const component = new KubeHunterReportDetailsComponent(route, service, clusters, {} as any, changeDetector);
    component.ngOnInit();
    return {component, service, clusters, changeDetector};
  }

  it('renders findings from the stored kube-hunter dispatcher JSON', () => {
    const {component, service, changeDetector} = create();
    expect(changeDetector.markForCheck).toHaveBeenCalled();
    expect(service.getKubeHunterReportById).toHaveBeenCalledWith(9);
    expect(component.loading).toBeFalse();
    expect(component.loadError).toBe('');
    expect(component.issues['worker-1'].length).toBe(1);
    expect(component.dataSource.length).toBe(1);
  });

  it('accepts an already parsed vulnerabilities object', () => {
    const {component} = create({...report, vulnerabilities: {value: {value: [vuln]}}});
    expect(component.vulnerabilities.length).toBe(1);
  });

  it('shows zero findings without displaying an error for a clean scan', () => {
    const {component} = create({...report, vulnerabilities: {value: {value: []}}});
    expect(component.vulnerabilities.length).toBe(0);
    expect(component.loadError).toBe('');
  });

  it('leaves loading state after the API exceeds its deadline', fakeAsync(() => {
    const {component, changeDetector} = create(undefined, false, true);
    expect(component.loading).toBeTrue();
    tick(15001);
    expect(component.loading).toBeFalse();
    expect(component.loadError).toContain('timed out');
    expect(changeDetector.markForCheck).toHaveBeenCalled();
  }));

  it('surfaces an HTTP 403 instead of silently hiding the details page', () => {
    const {component, changeDetector} = create(undefined, true);
    expect(component.loading).toBeFalse();
    expect(changeDetector.markForCheck).toHaveBeenCalled();
    expect(component.loadError).toContain('HTTP 403');
  });
});
