import {FalcoService} from './falco.service';

describe('RC4 Falco webhook persistence semantics', () => {
  let service: FalcoService;
  let dao: any;
  let logger: any;

  const event = {
    rule: 'Test rule', priority: 'Warning', output: 'Mock Falco alert',
    outputFields: {
      k8sNamespaceName: 'acceptance',
      containerImageRepository: 'busybox',
      k8sPodName: 'falco-test'
    }
  };

  beforeEach(() => {
    dao = {createFalcoLog: jest.fn().mockResolvedValue({id: 9, clusterId: 3})};
    logger = {log: jest.fn()};
    service = new FalcoService(dao, {} as any, {} as any, {} as any, logger);
  });

  it('acknowledges a persisted event even if email notification fails', async () => {
    jest.spyOn(service, 'sendFalcoEmailAlert').mockRejectedValue(new Error('SMTP offline'));
    await expect(service.createFalcoLog(3, event as any)).resolves.toMatchObject({id: 9});
    expect(dao.createFalcoLog).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      'Falco notification failed after event persistence',
      expect.objectContaining({eventId: 9, clusterId: 3})
    );
  });

  it('does not acknowledge failed database persistence', async () => {
    dao.createFalcoLog.mockRejectedValue(new Error('database unavailable'));
    const notify = jest.spyOn(service, 'sendFalcoEmailAlert');
    await expect(service.createFalcoLog(3, event as any)).rejects.toThrow('database unavailable');
    expect(notify).not.toHaveBeenCalled();
  });
});
