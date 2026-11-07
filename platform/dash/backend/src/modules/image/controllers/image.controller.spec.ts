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
});
