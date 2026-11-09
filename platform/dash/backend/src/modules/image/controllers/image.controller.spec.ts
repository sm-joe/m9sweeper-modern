import {BadRequestException, NotFoundException} from '@nestjs/common';
import {ImageController} from './image.controller';

describe('Trivy report ingestion security', () => {
  let controller: ImageController;
  let imageService: any;

  beforeEach(() => {
    imageService = {
      getImageByImageId: jest.fn(),
      getImageById: jest.fn()
    };
    controller = new ImageController(imageService, {} as any, {} as any, {} as any);
  });

  it('shows latest durable scan failure for authorized cluster and image', async () => {
    imageService.getLatestScanRun = jest.fn().mockResolvedValue({
      id: 'run-id', status: 'failed', failure_reason: 'Scan exhausted retries'
    });
    await expect(controller.getLatestImageScanRun(9, 22)).resolves.toMatchObject({
      status: 'failed', failure_reason: 'Scan exhausted retries'
    });
    expect(imageService.getLatestScanRun).toHaveBeenCalledWith(9, 22);
  });

  it('rejects invalid scan scope before looking up status', async () => {
    imageService.getLatestScanRun = jest.fn();
    await expect(controller.getLatestImageScanRun('bad' as any, 22))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(imageService.getLatestScanRun).not.toHaveBeenCalled();
  });

  it('rejects a missing report before reading or writing image data', async () => {
    await expect(controller.saveImageScanResults(9, 22, undefined as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(imageService.getImageByImageId).not.toHaveBeenCalled();
  });

  it('rejects empty scanner results instead of claiming clean compliance', async () => {
    await expect(controller.saveImageScanResults(9, 22, {data: []} as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects negative vulnerability counts instead of persisting malformed evidence', async () => {
    await expect(controller.saveImageScanResults(9, 22, {
      data: [{
        policyId: 1, issues: [], criticalIssues: -1, majorIssues: 0,
        mediumIssues: 0, lowIssues: 0, negligibleIssues: 0
      }]
    } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses cluster-scoped lookup and never uses unscoped image lookup', async () => {
    imageService.getImageByImageId.mockRejectedValue(new NotFoundException('Image not in cluster'));
    await expect(controller.saveImageScanResults(9, 22, {
      data: [{
        policyId: 1, issues: [], criticalIssues: 0, majorIssues: 1,
        mediumIssues: 0, lowIssues: 0, negligibleIssues: 0
      }]
    } as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(imageService.getImageByImageId).toHaveBeenCalledWith(9, 22);
    expect(imageService.getImageById).not.toHaveBeenCalled();
  });

  it('rejects an absent cluster image even when the lookup returns undefined', async () => {
    imageService.getImageByImageId.mockResolvedValue(undefined);
    await expect(controller.saveImageScanResults(9, 22, {
      data: [{
        policyId: 1, issues: [], criticalIssues: 0, majorIssues: 0,
        mediumIssues: 0, lowIssues: 0, negligibleIssues: 0
      }]
    } as any)).rejects.toMatchObject({status: 404});
    expect(imageService.getImageById).not.toHaveBeenCalled();
  });
  it('persists HIGH findings on the requested image and clears its queue flag', async () => {
    const image = {id: 1, clusterId: 4, dockerImageId: 'old-runtime-digest'};
    imageService.getImageByImageId.mockResolvedValue(image);
    imageService.getImageById.mockResolvedValue(image);
    imageService.saveImageScanDataByImageId = jest.fn().mockResolvedValue([51]);
    imageService.updateImageScanDateByImageId = jest.fn().mockResolvedValue(undefined);
    imageService.setImageScanQueueStatus = jest.fn().mockResolvedValue(undefined);
    imageService.getImageByImageHash = jest.fn();
    imageService.createImage = jest.fn();
    (controller as any).imageComplianceFacadeService = {
      isImageClusterCompliant: jest.fn().mockResolvedValue({
        compliant: true,
        complianceMap: {getResultForCve: jest.fn()}
      })
    };

    const response = await controller.saveImageScanResults(4, 1, {data: [{
      policyId: 7, policyStatus: true, encounterError: false,
      imageHash: 'different-registry-digest', issues: [],
      criticalIssues: 0, majorIssues: 34,
      mediumIssues: 23, lowIssues: 1, negligibleIssues: 4
    }]} as any);

    expect(imageService.getImageByImageHash).not.toHaveBeenCalled();
    expect(imageService.createImage).not.toHaveBeenCalled();
    expect(imageService.saveImageScanDataByImageId).toHaveBeenCalledWith(
      4, 1, expect.any(Object), expect.any(Number)
    );
    expect(imageService.updateImageScanDateByImageId).toHaveBeenCalledWith(
      1, 'Non-compliant', 0, 34, 23, 1, 4
    );
    expect(imageService.setImageScanQueueStatus).toHaveBeenCalledWith(1, false);
    expect(response.complaint).toBe(false);
  });

  it('does not mark an errored scan compliant when its vulnerability counts are zero', async () => {
    const image = {id: 1, clusterId: 4, dockerImageId: 'runtime-digest'};
    imageService.getImageByImageId.mockResolvedValue(image);
    imageService.getImageById.mockResolvedValue(image);
    imageService.saveImageScanDataByImageId = jest.fn().mockResolvedValue([52]);
    imageService.updateImageScanDateByImageId = jest.fn();
    imageService.setImageScanQueueStatus = jest.fn();
    (controller as any).imageComplianceFacadeService = {
      isImageClusterCompliant: jest.fn().mockResolvedValue({
        compliant: true, complianceMap: {getResultForCve: jest.fn()}
      })
    };
    await controller.saveImageScanResults(4, 1, {data: [{
      policyId: 7, policyStatus: true, encounterError: true,
      issues: [], criticalIssues: 0, majorIssues: 0,
      mediumIssues: 0, lowIssues: 0, negligibleIssues: 0
    }]} as any);
    expect(imageService.updateImageScanDateByImageId).toHaveBeenCalledWith(
      1, 'Non-compliant', 0, 0, 0, 0, 0
    );
  });


  const runId = 'a68e5b16-4a53-40b8-8edc-8fe75c779118';
  const report = {data: [{
    policyId: 7, encounterError: false, imageHash: 'new-digest',
    issues: [], criticalIssues: 0, majorIssues: 34,
    mediumIssues: 23, lowIssues: 1, negligibleIssues: 0
  }]};

  it('returns original completion for duplicate run without persisting again', async () => {
    imageService.getImageByImageId.mockResolvedValue({id: 1});
    imageService.getImageById.mockResolvedValue({id: 1, dockerImageId: 'runtime'});
    imageService.getScanRun = jest.fn().mockResolvedValue({
      id: runId, image_id: 1, cluster_id: 4, status: 'completed', compliant: false
    });
    imageService.claimScanRun = jest.fn();
    imageService.commitScanRun = jest.fn();
    const result = await controller.saveImageScanResults(4, 1, report as any, runId);
    expect(result.complaint).toBe(false);
    expect(imageService.claimScanRun).not.toHaveBeenCalled();
    expect(imageService.commitScanRun).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key belonging to another cluster or image', async () => {
    imageService.getImageByImageId.mockResolvedValue({id: 1});
    imageService.getImageById.mockResolvedValue({id: 1, dockerImageId: 'runtime'});
    imageService.getScanRun = jest.fn().mockResolvedValue({
      id: runId, image_id: 1, cluster_id: 99, status: 'completed', compliant: false
    });
    await expect(controller.saveImageScanResults(4, 1, report as any, runId))
      .rejects.toMatchObject({status: 404});
  });

  it('commits a new run atomically instead of saving individual policy rows', async () => {
    imageService.getImageByImageId.mockResolvedValue({id: 1});
    imageService.getImageById.mockResolvedValue({id: 1, dockerImageId: 'runtime'});
    imageService.getScanRun = jest.fn().mockResolvedValue({
      id: runId, image_id: 1, cluster_id: 4, status: 'published'
    });
    imageService.claimScanRun = jest.fn().mockResolvedValue(true);
    imageService.commitScanRun = jest.fn().mockResolvedValue(false);
    imageService.saveImageScanDataByImageId = jest.fn();
    (controller as any).imageComplianceFacadeService = {
      isImageClusterCompliant: jest.fn().mockResolvedValue({
        compliant: true, complianceMap: {getResultForCve: jest.fn()}
      })
    };
    const result = await controller.saveImageScanResults(4, 1, report as any, runId);
    expect(imageService.commitScanRun).toHaveBeenCalledWith(
      runId, 4, 1, expect.any(Array), 'Non-compliant',
      expect.objectContaining({major: 34, medium: 23}), expect.any(Number)
    );
    expect(imageService.saveImageScanDataByImageId).not.toHaveBeenCalled();
    expect(result.complaint).toBe(false);
  });

  it('rejects repeated policy IDs before claiming a run', async () => {
    await expect(controller.saveImageScanResults(4, 1, {
      data: [report.data[0], report.data[0]]
    } as any, runId)).rejects.toMatchObject({status: 400});
  });

  it('accepts a scoped terminal failed-run report from the worker', async () => {
    imageService.recordQuarantinedScanRun = jest.fn().mockResolvedValue(true);
    await expect(controller.quarantineFailedScan(4, 1, {scanRunId: runId}))
      .resolves.toEqual({failed: true});
    expect(imageService.recordQuarantinedScanRun).toHaveBeenCalledWith(runId, 4, 1);
  });

  it('reopens a claimed run for retry when the atomic persistence fails', async () => {
    const runId = 'a68e5b16-4a53-40b8-8edc-8fe75c779118';
    imageService.getImageByImageId.mockResolvedValue({id: 1});
    imageService.getImageById.mockResolvedValue({id: 1, dockerImageId: 'runtime'});
    imageService.getScanRun = jest.fn().mockResolvedValue({
      id: runId, cluster_id: 4, image_id: 1, status: 'published'
    });
    imageService.claimScanRun = jest.fn().mockResolvedValue(true);
    imageService.commitScanRun = jest.fn().mockRejectedValue(new Error('database transaction failed'));
    imageService.releaseScanRunForRetry = jest.fn().mockResolvedValue(undefined);
    (controller as any).imageComplianceFacadeService = {
      isImageClusterCompliant: jest.fn().mockResolvedValue({
        compliant: true, complianceMap: {getResultForCve: jest.fn()}
      })
    };
    await expect(controller.saveImageScanResults(4, 1, {data: [{
      policyId: 7, issues: [], criticalIssues: 0,
      majorIssues: 34, mediumIssues: 0, lowIssues: 0,
      negligibleIssues: 0, encounterError: false
    }]} as any, runId)).rejects.toThrow('database transaction failed');
    expect(imageService.releaseScanRunForRetry).toHaveBeenCalledWith(runId, 4, 1);
  });

});
