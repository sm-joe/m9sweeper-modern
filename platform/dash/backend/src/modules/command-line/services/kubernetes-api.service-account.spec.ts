import {KubernetesApiService} from './kubernetes-api.service';
import {parse as parseYaml} from 'yaml';

describe('Kubernetes service-account token onboarding', () => {
  const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQifQ.signature';

  function makeService(): KubernetesApiService {
    const service = new KubernetesApiService({} as any);
    jest.spyOn(service, 'makeCoreV1ApiFromConfig').mockImplementation(() =>
      ({listNamespace: async () => ({body: {items: []}})} as any)
    );
    return service;
  }

  it.each([
    ['raw JWT token', jwt],
    ['base64 Secret token', Buffer.from(jwt, 'utf8').toString('base64')]
  ])('accepts a %s without double-decoding', async (_name, supplied) => {
    const result = await makeService().buildAndTestServiceAccountConfig(
      'https://example.test:443', supplied, 'm9sweeper-test', Buffer.from('ca-cert').toString('base64')
    );
    expect(result.valid).toBe(true);
    const config = parseYaml(Buffer.from(result.config, 'base64').toString('utf8'));
    expect(config.users[0].user.token).toBe(jwt);
    expect(config.clusters[0].cluster['insecure-skip-tls-verify']).not.toBe(true);
  });

  it('does not accept arbitrary strings as service-account credentials', async () => {
    const result = await makeService().buildAndTestServiceAccountConfig(
      'https://example.test:443', 'not-a-token', 'm9sweeper-test', Buffer.from('ca-cert').toString('base64')
    );
    expect(result).toEqual({valid: false, config: null});
  });
});
