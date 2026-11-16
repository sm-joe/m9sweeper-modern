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
  it('uses canonical EKS ECR repository from the runtime rather than Docker Hub for short addon names', () => {
    const runtime = '602401143452.dkr.ecr.us-east-1.amazonaws.com/amazon-k8s-cni@sha256:' + digest;
    const qualified = service.resolveScanImageReference('amazon-k8s-cni:v1.22.4-eksbuild.10', runtime);
    expect(qualified).toBe('602401143452.dkr.ecr.us-east-1.amazonaws.com/amazon-k8s-cni:v1.22.4-eksbuild.10');
    expect(service.parseDockerImageUrl(qualified).host).toBe('602401143452.dkr.ecr.us-east-1.amazonaws.com');
  });

  it('never treats an opaque runtime image config digest as a registry image', () => {
    expect(service.resolveScanImageReference('amazon-k8s-cni:v1', 'containerd://sha256:' + digest))
      .toBe('docker.io/amazon-k8s-cni:v1');
  });

  it('does not let runtime identity replace an explicitly configured image registry', () => {
    const ecr = '602401143452.dkr.ecr.us-east-1.amazonaws.com/amazon-k8s-cni:v1';
    expect(service.resolveScanImageReference(ecr, 'example.com/amazon-k8s-cni@sha256:' + digest))
      .toBe(ecr);
  });

  it('rejects a mismatched runtime repository when resolving short image names', () => {
    expect(service.resolveScanImageReference('amazon-k8s-cni:v1', 'evil.example/replaced@sha256:' + digest))
      .toBe('docker.io/amazon-k8s-cni:v1');
  });

});
