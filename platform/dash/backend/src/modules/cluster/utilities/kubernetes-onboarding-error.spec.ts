import {classifyKubernetesOnboardingError} from './kubernetes-onboarding-error';

describe('safe Kubernetes onboarding error classification', () => {
  it.each([
    [{code:'ENOTFOUND', message:'getaddrinfo ENOTFOUND kind-control-plane'}, 'DNS'],
    [{cause:{code:'EAI_AGAIN'}}, 'DNS'],
    [{code:'ECONNREFUSED'}, 'unreachable'],
    [{statusCode:401}, 'authentication'],
    [{response:{statusCode:403}}, 'authorization'],
    [{code:'ERR_TLS_CERT_ALTNAME_INVALID'}, 'TLS'],
    [{message:'Kubeconfig API server is localhost'}, 'localhost'],
    [{message:'Kubeconfig uses an external exec credential command'}, 'exec']
  ])('classifies %p without exposing raw endpoint', (input, category) => {
    expect(classifyKubernetesOnboardingError(input).message).toMatch(new RegExp(category, 'i'));
  });

  it('redacts unknown error messages and private secrets', () => {
    const raw = 'failed connecting https://private.local:6443 bearer=highly-sensitive-token';
    const outcome = classifyKubernetesOnboardingError({message: raw});
    expect(outcome.message).not.toContain('private.local');
    expect(outcome.message).not.toContain('highly-sensitive-token');
    expect(outcome.message).toMatch(/Kubernetes onboarding failed/);
  });
});
