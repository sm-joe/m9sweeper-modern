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
            setImageScanQueueStatus: jest.fn().mockResolvedValue(imageId)
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

    it('marks queued only after broker acceptance', async () => {
        await expect(service.createImageScanByImageId([{id: imageId}], clusterId)).resolves.toBe(true);
        expect(messaging.send).toHaveBeenCalledWith('scan-images', expect.objectContaining({image: expect.any(Object)}));
        expect(dao.setImageScanQueueStatus).toHaveBeenCalledWith(imageId, true);
    });

    it('refuses a rejected broker message without setting queued', async () => {
        messaging.send.mockResolvedValue(false);
        await expect(service.createImageScanByImageId([{id: imageId}], clusterId)).rejects.toMatchObject({status: 503});
        expect(dao.setImageScanQueueStatus).not.toHaveBeenCalled();
    });

    it('does not swallow a broker error', async () => {
        messaging.send.mockRejectedValue(new Error('broker offline'));
        await expect(service.createImageScanByImageId([{id: imageId}], clusterId)).rejects.toThrow('broker offline');
        expect(dao.setImageScanQueueStatus).not.toHaveBeenCalled();
    });

    it('does not report success if queue-status persistence fails', async () => {
        dao.setImageScanQueueStatus.mockRejectedValue(new Error('database offline'));
        await expect(service.createImageScanByImageId([{id: imageId}], clusterId)).rejects.toThrow('database offline');
    });

    it('rejects missing scan policies before publishing', async () => {
        dao.countGlobalPoliciesNotIncludedInPolicyCluster.mockResolvedValue({globalPolicyCount: 0});
        dao.getImageDetailsForScanImage.mockResolvedValue([{policyCount: 0, image: {name: 'app', tag: 'v1'}}]);
        await expect(service.createImageScanByImageId([{id: imageId}], clusterId)).rejects.toBeInstanceOf(HttpException);
        expect(messaging.send).not.toHaveBeenCalled();
    });

    it('rejects an empty image batch', async () => {
        await expect(service.createImageScanByImageId([], clusterId)).rejects.toMatchObject({status: 400});
        expect(messaging.send).not.toHaveBeenCalled();
    });
});
