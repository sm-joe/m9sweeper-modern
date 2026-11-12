import {ClusterSyncCommand} from './cluster-sync.command';

describe('ClusterSyncCommand refuses false success on unreachable clusters', () => {
  function subject(syncSucceeded: boolean) {
    const kubernetesClusterService: any = {
      sync: jest.fn().mockResolvedValue({
        everythingSuccessfullySynced: syncSucceeded,
        nodeSummary: {numNodes: null, numCPU: null, amountRAM: null}
      })
    };
    const clusterDao: any = {
      getClustersById: jest.fn().mockResolvedValue([{id: 2, name: 'kind'}]),
      updateClusterLastScanned: jest.fn().mockResolvedValue(undefined)
    };
    const clusterEventService: any = {
      createClusterEventObject: jest.fn().mockReturnValue({type: 'Error'}),
      createClusterEvent: jest.fn().mockResolvedValue(undefined)
    };
    const compliance: any = {
      calculateNamespaceComplianceForClusterPods: jest.fn().mockResolvedValue(undefined)
    };
    const logger: any = {log: jest.fn()};
    const service = new ClusterSyncCommand(
      logger, kubernetesClusterService, {} as any, clusterDao, {} as any,
      {} as any, {} as any, clusterEventService, {} as any, compliance
    );
    return {service, kubernetesClusterService, clusterDao, clusterEventService, compliance};
  }

  it('returns false and skips compliance when inventory could not be synchronized', async () => {
    const {service, clusterDao, compliance} = subject(false);
    await expect(service.syncCluster('2')).resolves.toBe(false);
    expect(clusterDao.updateClusterLastScanned).not.toHaveBeenCalled();
    expect(compliance.calculateNamespaceComplianceForClusterPods).not.toHaveBeenCalled();
  });

  it('returns true and updates last-scanned only after successful inventory', async () => {
    const {service, clusterDao, compliance} = subject(true);
    await expect(service.syncCluster('2')).resolves.toBe(true);
    expect(clusterDao.updateClusterLastScanned).toHaveBeenCalledWith(2);
    expect(compliance.calculateNamespaceComplianceForClusterPods).toHaveBeenCalled();
  });
});
