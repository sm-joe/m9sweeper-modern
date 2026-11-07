import {HttpException} from '@nestjs/common';
import {ImageService} from './image.service';

describe('ImageService scan queue safety', () => {
    const clusterId = 12;
    const imageId = 41;
    let dao: any;
    let messaging: any;
    let service: ImageService;

    beforeEach(() => {
        dao = {
            getImageDetailsForScanImage: jest.fn().mockResolvedValue([{
                policyCount: 1,
                image: {name: 'app', tag: 'v1', path: '/tmp'}
            }]),
            countGlobalPoliciesNotIncludedInPolicyCluster: jest.fn().mockResolvedValue({globalPolicyCount: 0}),
            setImageScanQueueStatus: jest.fn().mockResolvedValue(imageId),
            createScanRun: jest.fn().mockResolvedValue(undefined),
            markScanRunPublished: jest.fn().mockResolvedValue(undefined),
            markScanRunFailed: jest.fn().mockResolvedValue(undefined)
        };
        messaging = {send: jest.fn().mockResolvedValue(true)};
        service = new ImageService(
            dao,
            {getClusterById: jest.fn().mockResolvedValue({id: clusterId})} as any,
            messaging,
            {get: jest.fn().mockReturnValue('scan-images')} as any,
            {} as any,
            {} as any
        );
    });

    it('marks queued before broker publication', async () => {
        await expect(service.createImageScanByImageId([{id: imageId}], clusterId)).resolves.toBe(true);
        expect(messaging.send).toHaveBeenCalledWith('scan-images', expect.objectContaining({
            image: expect.any(Object),
            scanRunId: expect.stringMatching(/^[0-9a-f-]{36}$/)
        }));
        expect(dao.createScanRun).toHaveBeenCalledWith(
            expect.any(String), clusterId, imageId
        );
        expect(dao.markScanRunPublished).toHaveBeenCalledWith(expect.any(String));
        expect(dao.setImageScanQueueStatus).toHaveBeenCalledWith(imageId, true);
        expect(dao.setImageScanQueueStatus.mock.invocationCallOrder[0]).toBeLessThan(messaging.send.mock.invocationCallOrder[0]);
    });

    it('rolls back the queued flag when the broker rejects the message', async () => {
        messaging.send.mockResolvedValue(false);
        await expect(service.createImageScanByImageId([{id: imageId}], clusterId)).rejects.toMatchObject({status: 503});
        expect(dao.setImageScanQueueStatus).toHaveBeenNthCalledWith(1, imageId, true);
        expect(dao.setImageScanQueueStatus).toHaveBeenNthCalledWith(2, imageId, false);
        expect(dao.markScanRunFailed).toHaveBeenCalledWith(expect.any(String), 'Broker publication failed');
    });

    it('rolls back and propagates broker errors', async () => {
        messaging.send.mockRejectedValue(new Error('broker offline'));
        await expect(service.createImageScanByImageId([{id: imageId}], clusterId)).rejects.toThrow('broker offline');
        expect(dao.setImageScanQueueStatus).toHaveBeenNthCalledWith(1, imageId, true);
        expect(dao.setImageScanQueueStatus).toHaveBeenNthCalledWith(2, imageId, false);
        expect(dao.setImageScanQueueStatus).toHaveBeenCalledTimes(2);
    });

    it('does not report success if queue-status persistence fails', async () => {
        dao.setImageScanQueueStatus.mockRejectedValue(new Error('database offline'));
        await expect(service.createImageScanByImageId([{id: imageId}], clusterId)).rejects.toThrow('database offline');
        expect(messaging.send).not.toHaveBeenCalled();
    });

    it('rejects missing scan policies before publishing', async () => {
        dao.countGlobalPoliciesNotIncludedInPolicyCluster.mockResolvedValue({globalPolicyCount: 0});
        dao.getImageDetailsForScanImage.mockResolvedValue([{policyCount: 0, image: {name: 'app', tag: 'v1'}}]);
        await expect(service.createImageScanByImageId([{id: imageId}], clusterId))
            .rejects.toMatchObject({status: 422});
        expect(messaging.send).not.toHaveBeenCalled();
    });

    it('rejects an empty image batch', async () => {
        await expect(service.createImageScanByImageId([], clusterId)).rejects.toMatchObject({status: 400});
        expect(messaging.send).not.toHaveBeenCalled();
    });
});
