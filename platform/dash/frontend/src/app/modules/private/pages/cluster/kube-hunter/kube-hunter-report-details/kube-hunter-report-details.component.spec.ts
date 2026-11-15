import {convertToParamMap} from '@angular/router';
import {of, throwError} from 'rxjs';
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

  function create(response: any = report, fail = false) {
    const route: any = {snapshot: {paramMap: convertToParamMap({id: '9'})}};
    const service: any = {getKubeHunterReportById: jasmine.createSpy('getKubeHunterReportById')
      .and.returnValue(fail ? throwError({status: 403}) : of(response))};
    const clusters: any = {getClusterById: jasmine.createSpy('getClusterById')
      .and.returnValue(of({data: {id: 3, name: 'kind-local'}}))};
    const component = new KubeHunterReportDetailsComponent(route, service, clusters, {} as any);
    component.ngOnInit();
    return {component, service, clusters};
  }

  it('renders findings from the stored kube-hunter dispatcher JSON', () => {
    const {component, service} = create();
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

  it('surfaces an HTTP 403 instead of silently hiding the details page', () => {
    const {component} = create(undefined, true);
    expect(component.loading).toBeFalse();
    expect(component.loadError).toContain('HTTP 403');
  });
});
