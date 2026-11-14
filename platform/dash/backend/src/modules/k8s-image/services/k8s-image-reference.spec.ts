import {K8sImageService} from './k8s-image.service';

describe('Kubernetes image reference parsing for vulnerability scans', () => {
  const service = new K8sImageService(
    {} as any, {} as any, {} as any, {} as any,
    {} as any, {} as any, {} as any
  );
  const digest = 'a'.repeat(64);

  it('preserves a tag and OCI digest without rewriting the digest into a tag', () => {
    const reference = `ghcr.io/sm-joe/m9sweeper-trawler:v0.1.2@sha256:${digest}`;
    expect(service.formatDockerImageUrl(reference)).toBe(reference);
    expect(service.parseDockerImageUrl(reference)).toEqual({
      host: 'ghcr.io',
      path: 'sm-joe',
      imageName: 'm9sweeper-trawler',
      tag: `v0.1.2@sha256:${digest}`
    });
  });

  it('supports digest-only image references without inventing an invalid tag', () => {
    const reference = `ghcr.io/sm-joe/m9sweeper-trawler@sha256:${digest}`;
    expect(service.formatDockerImageUrl(reference)).toBe(reference);
    expect(service.parseDockerImageUrl(reference)).toEqual({
      host: 'ghcr.io', path: 'sm-joe', imageName: 'm9sweeper-trawler',
      tag: `@sha256:${digest}`
    });
  });

  it('keeps the ordinary tag, implicit latest and registry port', () => {
    expect(service.formatDockerImageUrl('nginx:1.27')).toBe('docker.io/nginx:1.27');
    expect(service.formatDockerImageUrl('nginx')).toBe('docker.io/nginx:latest');
    const local = 'localhost:5000/team/app:3.2';
    expect(service.formatDockerImageUrl(local)).toBe(local);
    expect(service.parseDockerImageUrl(local)).toEqual({
      host: 'localhost:5000', path: 'team', imageName: 'app', tag: '3.2'
    });
  });

  it('does not assign a sha256 digest to the image tag accidentally', () => {
    const reference = `ghcr.io/sm-joe/m9sweeper-trawler:v0.1.2@sha256:${digest}`;
    const normalized = service.formatDockerImageUrl(reference);
    const parts = service.parseDockerImageUrl(normalized);
    expect(parts.tag).not.toBe(digest);
    expect(parts.tag.startsWith('v0.1.2@sha256:')).toBe(true);
  });
});
