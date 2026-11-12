import {KubernetesClusterService} from './kubernetes-cluster.service';

describe('KubernetesClusterService: fail-closed pod synchronization', () => {
    function subject() {
        const podService: any = {
            savePod: jest.fn().mockResolvedValue(undefined),
            deleteDeadPods: jest.fn().mockResolvedValue(undefined)
        };
        const eventService: any = {
            createClusterEventObject: jest.fn().mockReturnValue({type: 'Error'}),
            createClusterEvent: jest.fn().mockResolvedValue(undefined)
        };
        const logger: any = {log: jest.fn()};
        const service = new KubernetesClusterService(
            logger, {} as any, {} as any, {} as any, {} as any,
            podService, {} as any, {} as any, eventService
        );
        const pods = [
            {metadata: {name: 'a', namespace: 'ns-a'}},
            {metadata: {name: 'b', namespace: 'ns-b'}}
        ] as any;
        return {service, podService, eventService, logger, pods};
    }

    it('checks required namespace access, not optional node permissions', async () => {
        const {service, eventService} = subject();
        const coreApi: any = {
            listNamespace: jest.fn().mockResolvedValue({body: {items: []}}),
            listNode: jest.fn().mockRejectedValue({statusCode: 403})
        };
        await expect((service as any).testCoreAPI({id: 2}, coreApi)).resolves.toBe(true);
        expect(coreApi.listNamespace).toHaveBeenCalledTimes(1);
        expect(coreApi.listNode).not.toHaveBeenCalled();
        expect(eventService.createClusterEvent).not.toHaveBeenCalled();
    });

    it.each([
      [{statusCode: 403}, 'authorization denied (403)'],
      [{statusCode: 401}, 'authentication failed (401)'],
      [{code: 'ECONNREFUSED'}, 'unreachable from Dash']
    ])('reports sanitized actionable failure for %p', async (failure, message) => {
        const {service, eventService, logger} = subject();
        const coreApi: any = {listNamespace: jest.fn().mockRejectedValue(failure)};
        await expect((service as any).testCoreAPI({id: 2}, coreApi)).resolves.toBe(false);
        expect(eventService.createClusterEventObject).toHaveBeenCalledWith(
            0, 'Batch Job', 'Get', 'Error', expect.stringContaining(message),
            'KubernetesClusterService.testCoreAPI()'
        );
        expect(logger.log).toHaveBeenCalledWith(
            expect.objectContaining({label: 'Kubernetes API readiness check failed'}),
            'KubernetesClusterService.testCoreAPI()'
        );
    });

    it('explains why a host-local Kind API endpoint cannot work from Compose', async () => {
        const {service, eventService} = subject();
        const coreApi: any = {listNamespace: jest.fn()};
        await expect((service as any).testCoreAPI({id: 2}, coreApi, 'https://127.0.0.1:57363'))
          .resolves.toBe(false);
        expect(coreApi.listNamespace).not.toHaveBeenCalled();
        expect(eventService.createClusterEventObject).toHaveBeenCalledWith(
          0, 'Batch Job', 'Get', 'Error',
          expect.stringContaining('Stored Kubernetes API endpoint is localhost/127.0.0.1'),
          'KubernetesClusterService.testCoreAPI()'
        );
    });

    it('does not delete existing inventory after a partial DB write failure', async () => {
        const {service, podService, eventService, pods} = subject();
        podService.savePod.mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('postgres insert failed'));
        await expect((service as any).saveK8sPods(2, pods, {})).resolves.toBe(false);
        expect(podService.savePod).toHaveBeenCalledTimes(2);
        expect(podService.deleteDeadPods).not.toHaveBeenCalled();
        expect(eventService.createClusterEvent).toHaveBeenCalledTimes(1);
        expect(eventService.createClusterEventObject).toHaveBeenCalledWith(
            0, 'Batch Job', 'Update', 'Error',
            expect.stringContaining('1 of 2 running pods failed'), 2
        );
    });

    it('deletes stale pod rows only after all live Pod saves succeed', async () => {
        const {service, podService, eventService, pods} = subject();
        await expect((service as any).saveK8sPods(2, pods, {})).resolves.toBe(true);
        expect(podService.deleteDeadPods).toHaveBeenCalledWith(2, [
            {name: 'a', namespace: 'ns-a'}, {name: 'b', namespace: 'ns-b'}
        ]);
        expect(eventService.createClusterEvent).not.toHaveBeenCalled();
    });

    it('does not claim successful synchronization when database cleanup fails', async () => {
        const {service, podService, pods} = subject();
        podService.deleteDeadPods.mockRejectedValue(new Error('transaction aborted'));
        await expect((service as any).saveK8sPods(2, pods, {}))
            .rejects.toThrow('transaction aborted');
    });
});
