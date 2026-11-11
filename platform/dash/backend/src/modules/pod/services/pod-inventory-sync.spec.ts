import {PodService} from './pod.service';

describe('PodService Kubernetes inventory compatibility', () => {
    const clusterId = 2;
    let podDao: any;
    let utility: any;
    let service: PodService;
    const images: any = {getIdForImage: jest.fn().mockReturnValue(11)};
    beforeEach(() => {
        podDao = {
            checkPodExists: jest.fn().mockResolvedValue([]),
            savePod: jest.fn().mockResolvedValue(91),
            linkExistingPodImages: jest.fn().mockResolvedValue(undefined)
        };
        utility = {extractImageHash: jest.fn().mockReturnValue('hash')};
        service = new PodService(podDao, utility, {} as any);
        images.getIdForImage.mockClear();
    });

    const pod = (overrides: any = {}) => ({
        metadata: {
            uid: 'ci-uid', name: 'demo', namespace: 'default',
            resourceVersion: '3', ...overrides.metadata
        },
        status: {
            phase: 'Running', ...overrides.status
        },
        spec: {
            containers: [{name: 'main', image: 'nginx:latest'}],
            ...overrides.spec
        }
    });

    it('saves Running Pods with no containerStatuses, timestamp or init status', async () => {
        await expect(service.savePod(pod() as any, clusterId, images)).resolves.toBeUndefined();
        expect(utility.extractImageHash).not.toHaveBeenCalled();
        expect(images.getIdForImage).toHaveBeenCalledWith('nginx:latest', undefined);
        expect(podDao.savePod).toHaveBeenCalledWith(
            expect.objectContaining({name: 'demo', namespace: 'default',
                clusterId: 2, creationTimestamp: null}), [11]
        );
    });

    it('handles empty image lists without dereferencing unavailable status arrays', async () => {
        await expect(service.savePod(pod({
            spec: {containers: [], initContainers: [], ephemeralContainers: []},
            status: {containerStatuses: undefined}
        }) as any, clusterId, images)).resolves.toBeUndefined();
        expect(podDao.savePod).toHaveBeenCalledWith(expect.anything(), []);
    });

    it('propagates database failures rather than claiming the Pod was saved', async () => {
        podDao.savePod.mockRejectedValue(new Error('postgres unavailable'));
        await expect(service.savePod(pod() as any, clusterId, images))
            .rejects.toThrow('postgres unavailable');
    });

    it('does not fail when a Running Pod has no imageID in a container status', async () => {
        await service.savePod(pod({
            status: {containerStatuses: [{name: 'main'}]}
        }) as any, clusterId, images);
        expect(utility.extractImageHash).not.toHaveBeenCalled();
        expect(images.getIdForImage).toHaveBeenCalledWith('nginx:latest', undefined);
    });
});
