import { KubernetesApiService } from './kubernetes-api.service';
import { KubeConfig, KubernetesObjectApi } from '@kubernetes/client-node';

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

describe('service account token provisioning readiness', () => {
  const service = new KubernetesApiService({get: jest.fn()} as any);
  const validToken = Buffer.from('issued-service-account-jwt').toString('base64');

  it('waits for an asynchronously populated Secret', async () => {
    const secretReader = jest.fn()
      .mockResolvedValueOnce({body: {data: {}}})
      .mockResolvedValueOnce({body: {data: {token: validToken}}});
    const result = await service.getServiceAccountToken(
      {readNamespacedSecret: secretReader} as any, 'm9sweeper', 'default');
    expect(result).toBe('issued-service-account-jwt');
    expect(secretReader).toHaveBeenCalledTimes(2);
  });

  it('does not hide a Kubernetes RBAC 403', async () => {
    const forbidden = {statusCode: 403};
    const readNamespacedSecret = jest.fn().mockRejectedValue(forbidden);
    await expect(service.getServiceAccountToken(
      {readNamespacedSecret} as any, 'm9sweeper', 'default'
    )).rejects.toBe(forbidden);
    expect(readNamespacedSecret).toHaveBeenCalledTimes(1);
  });

  it('does not hide a Kubernetes DNS error', async () => {
    const networkFailure = {code: 'ENOTFOUND'};
    const readNamespacedSecret = jest.fn().mockRejectedValue(networkFailure);
    await expect(service.getServiceAccountToken(
      {readNamespacedSecret} as any, 'm9sweeper', 'default'
    )).rejects.toBe(networkFailure);
    expect(readNamespacedSecret).toHaveBeenCalledTimes(1);
  });

  it('accepts an already provisioned token immediately', async () => {
    const readNamespacedSecret = jest.fn().mockResolvedValue({
      body: {data: {token: validToken}}
    });
    await expect(service.getServiceAccountToken(
      {readNamespacedSecret} as any, 'm9sweeper', 'default'
    )).resolves.toBe('issued-service-account-jwt');
    expect(readNamespacedSecret).toHaveBeenCalledTimes(1);
  });
});

describe('Kubernetes object apply is fail closed', () => {
  const svc = new KubernetesApiService({get: jest.fn()} as any);
  const config = new KubeConfig();
  const target: any = {apiVersion: 'v1',kind: 'ServiceAccount',
    metadata:{name:'m9sweeper',namespace:'default'}};
  afterEach(() => jest.restoreAllMocks());

  function mockClient(readResult: Promise<any>) {
    const api = {read: jest.fn().mockReturnValue(readResult),
      create: jest.fn().mockResolvedValue({body: {id:'created'}}),
      patch: jest.fn().mockResolvedValue({body: {id:'patched'}})};
    jest.spyOn(KubernetesObjectApi, 'makeApiClient').mockReturnValue(api as any);
    return api;
  }

  it('creates only when a read returns 404', async () => {
    const api = mockClient(Promise.reject({statusCode:404}));
    await expect(svc.applyK8sObject(target, config)).resolves.toEqual({id:'created'});
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('updates an existing object without calling create', async () => {
    const api = mockClient(Promise.resolve({body:{id:'existing'}}));
    await expect(svc.applyK8sObject(target, config)).resolves.toEqual({id:'patched'});
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.create).not.toHaveBeenCalled();
  });

  it.each([{statusCode:401}, {statusCode:403}, {code:'ENOTFOUND'}, {code:'ETIMEDOUT'}])(
    'propagates read failures without attempting create: %p', async (failure) => {
      const api = mockClient(Promise.reject(failure));
      await expect(svc.applyK8sObject(target, config)).rejects.toBe(failure);
      expect(api.create).not.toHaveBeenCalled();
      expect(api.patch).not.toHaveBeenCalled();
    }
  );

  it('does not try create when patch of an existing object fails', async () => {
    const api = mockClient(Promise.resolve({body: {id:'existing'}}));
    const failure = {statusCode:403};
    api.patch.mockRejectedValue(failure);
    await expect(svc.applyK8sObject(target, config)).rejects.toBe(failure);
    expect(api.create).not.toHaveBeenCalled();
  });
});
