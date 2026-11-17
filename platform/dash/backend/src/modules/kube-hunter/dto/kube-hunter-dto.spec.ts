import {instanceToPlain, plainToInstance} from 'class-transformer';
import {KubeHunterDto} from './kube-hunter-dto';

describe('KubeHunterDto database mapping', () => {
  it('maps database report identifiers to frontend response properties', () => {
    const report = plainToInstance(KubeHunterDto, {
      id: 19, cluster_id: 3, created_at: 1794729909000, uuid: 'sample',
      nodes: {}, services: {}, vulnerabilities: {value: {value: []}}
    });
    expect(report.clusterId).toBe(3);
    expect(report.createdAt).toBe(1794729909000);
    expect(report.vulnerabilities).toEqual({value: {value: []}} as any);
  });

  it('writes actual report JSON and cluster ID without leaking class-transformer context', () => {
    const report = Object.assign(new KubeHunterDto(), {
      clusterId: 3, uuid: 'sample',
      nodes: {nodes: []},
      services: {services: []},
      vulnerabilities: {value: {value: []}}
    });
    const stored = instanceToPlain(report);
    expect(stored.cluster_id).toBe(3);
    expect(JSON.parse(stored.nodes)).toEqual({nodes: []});
    expect(JSON.parse(stored.vulnerabilities)).toEqual({value: {value: []}});
    expect(stored.vulnerabilities).not.toContain('obj');
  });
});
