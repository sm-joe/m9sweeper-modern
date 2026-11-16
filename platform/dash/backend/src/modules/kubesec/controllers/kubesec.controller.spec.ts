import {ROUTE_ARGS_METADATA} from '@nestjs/common/constants';
import {BadGatewayException, BadRequestException} from '@nestjs/common';
import {KubesecController} from './kubesec.controller';

describe('Kubesec cloud namespace/pod selection', () => {
  const podList = [{items: [{metadata: {name: 'nginx', namespace: 'default'}}]}];
  const makeController = (errors: unknown[] = []) => {
    const service = {
      listPods: jest.fn().mockResolvedValue({podList, errors}),
      listNamespaces: jest.fn(),
    };
    return {controller: new KubesecController(service as any), service};
  };

  it('binds the exact clusterId query key used by Angular HTTP requests', () => {
    // Direct controller calls cannot detect a mistyped @Query decorator.
    const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, KubesecController, 'listPods');
    const queryValues = Object.values(metadata) as Array<{data?: string}>;
    expect(queryValues.some(value => value.data === 'clusterId')).toBe(true);
    expect(queryValues.some(value => value.data === 'namespaces')).toBe(true);
  });

  it('accepts a single namespace value', async () => {
    const {controller, service} = makeController();
    expect(await controller.listPods(1, 'default' as any)).toBe(podList);
    expect(service.listPods).toHaveBeenCalledWith(1, ['default']);
  });

  it('accepts multiple namespaces, ignoring selectAll and duplicates', async () => {
    const {controller, service} = makeController();
    await controller.listPods(9, ['default', 'kube-system', 'selectAll', 'default']);
    expect(service.listPods).toHaveBeenCalledWith(9, ['default', 'kube-system']);
  });

  it('rejects missing cluster ID instead of silently querying another cluster', async () => {
    const {controller} = makeController();
    await expect(controller.listPods(undefined as any, ['default'])).rejects.toThrow(BadRequestException);
  });

  it('rejects empty and invalid namespace parameters', async () => {
    const {controller} = makeController();
    await expect(controller.listPods(1, ['selectAll'])).rejects.toThrow(BadRequestException);
    await expect(controller.listPods(1, ['../../secrets'])).rejects.toThrow(BadRequestException);
  });

  it('does not report an empty pod list after a Kubernetes API error', async () => {
    const {controller} = makeController([{statusCode: 403}]);
    await expect(controller.listPods(1, ['default'])).rejects.toThrow(BadGatewayException);
  });
});
