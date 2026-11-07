import { ClusterService } from './cluster.service';
import { KubeConfig } from '@kubernetes/client-node';

describe('cluster onboarding rejects insecure operator-provided service account config', () => {
  const clusterDao = {getClusterByClusterName: jest.fn().mockResolvedValue([])};
  const k8s = {AddServiceAccount: jest.fn()};
  const service = new ClusterService(clusterDao as any, {} as any, k8s as any,
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  function configuration(tlsDisabled: boolean, embedCA: boolean) {
    const config = new KubeConfig();
    config.addCluster({
      name: 'kind', server: 'https://kind-control-plane:6443',
      skipTLSVerify: tlsDisabled,
      caData: embedCA ? Buffer.from('certificate').toString('base64') : undefined
    });
    config.addUser({name:'test',token:'test'});
    config.addContext({name:'kind',cluster:'kind',user:'test'});
    config.setCurrentContext('kind');
    return Buffer.from(config.exportConfig()).toString('base64');
  }
  beforeEach(() => {jest.clearAllMocks();clusterDao.getClusterByClusterName.mockResolvedValue([]);});
  it('rejects TLS bypass before Kubernetes mutations or DB inserts', async () => {
    await expect(service.createCluster({name:'test'} as any, false, configuration(true,true)))
      .rejects.toMatchObject({status:400});
    expect(k8s.AddServiceAccount).not.toHaveBeenCalled();
  });
  it('rejects configurations missing an embedded CA', async () => {
    await expect(service.createCluster({name:'test'} as any, false, configuration(false,false)))
      .rejects.toMatchObject({status:400});
    expect(k8s.AddServiceAccount).not.toHaveBeenCalled();
  });
});
