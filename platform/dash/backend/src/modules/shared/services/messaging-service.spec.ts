import {MessagingService} from './messaging-service';

describe('MessagingService durable scan delivery', () => {
    let channel: {sendToQueue: jest.Mock};
    let rabbitMQService: {getChannel: jest.Mock};
    let logger: {log: jest.Mock; error: jest.Mock};
    let service: MessagingService;

    beforeEach(() => {
        channel = {sendToQueue: jest.fn().mockResolvedValue(true)};
        rabbitMQService = {getChannel: jest.fn().mockResolvedValue(channel)};
        logger = {log: jest.fn(), error: jest.fn()};
        service = new MessagingService(rabbitMQService as any, logger as any);
    });

    it('publishes scan jobs as persistent messages to survive broker restart', async () => {
        const message = {scanRunId: 'run-123', image: {id: 8}};
        await expect(service.send('trawler_queue', message)).resolves.toBe(true);
        expect(channel.sendToQueue).toHaveBeenCalledWith(
            'trawler_queue',
            message,
            expect.objectContaining({persistent: true})
        );
    });

    it('does not report success when the broker rejects publication', async () => {
        channel.sendToQueue.mockRejectedValue(new Error('broker disconnected'));
        await expect(service.send('trawler_queue', {image: {id: 8}})).resolves.toBeNull();
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});
