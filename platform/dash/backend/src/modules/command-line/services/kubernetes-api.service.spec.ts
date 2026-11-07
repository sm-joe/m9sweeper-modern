import { KubernetesApiService } from './kubernetes-api.service';
import { KubeConfig } from '@kubernetes/client-node';

describe('Kubernetes API client TLS requirements', () => {
  const svc = new KubernetesApiService({get: jest.fn().mockReturnValue('m9sweeper-system')} as any);
  const trustedCA = Buffer.from('test-ca-certificate').toString('base64');

  it('refuses to create insecure token-only kubeconfig without a CA', () => {
    expect(() => svc.buildServiceAccountConfig('token','https://kubernetes.default.svc','kind'))
      .toThrow(/trusted CA/);
  });
  it('creates a token config with verification enabled and the provided CA', () => {
    const config = svc.buildServiceAccountConfig('token','https://kubernetes.default.svc','kind',trustedCA);
    expect(config.getCurrentCluster().skipTLSVerify).toBe(false);
    expect(config.getCurrentCluster().caData).toBe(trustedCA);
  });
  function baseConfig(options: {caData?: string, skipTLSVerify?: boolean}): string {
    const config = new KubeConfig();
    config.addCluster({name:'kind',server:'https://kind-control-plane:6443',...options});
    config.addUser({name:'test',token:'test'});
    config.addContext({name:'kind',cluster:'kind',user:'test'});
    config.setCurrentContext('kind');
    return Buffer.from(config.exportConfig()).toString('base64');
  }
  it('refuses onboarding when the supplied kubeconfig disabled TLS verification', async () => {
    await expect(svc.AddServiceAccount(baseConfig({caData: trustedCA,skipTLSVerify:true})))
      .rejects.toThrow(/disables Kubernetes TLS verification/);
  });
  it('refuses onboarding without a trusted CA', async () => {
    await expect(svc.AddServiceAccount(baseConfig({})))
      .rejects.toThrow(/trusted cluster CA/);
  });
});
