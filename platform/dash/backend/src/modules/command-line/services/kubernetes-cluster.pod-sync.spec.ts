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
