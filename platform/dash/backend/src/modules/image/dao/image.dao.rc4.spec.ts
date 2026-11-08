import {ImageDao} from './image.dao';

describe('RC4 stale scan timeout boundaries', () => {
    it('uses a longer expiry window for broker-waiting jobs than for in-flight report ingestion', async () => {
        const comparisons: Array<{status: string; cutoff: number}> = [];
        let activeStatus = '';
        const nested: any = {
            where: jest.fn(function (arg1: any, op?: string, cutoff?: number) {
                if (typeof arg1 === 'function') {
                    arg1(nested);
                } else if (arg1 === 'status') {
                    activeStatus = String(op);
                } else if (arg1 === 'updated_at') {
                    comparisons.push({status: activeStatus, cutoff: cutoff!});
                }
                return nested;
            }),
            whereIn: jest.fn(function (_key: string, statuses: string[]) {
                activeStatus = statuses.join(',');
                return nested;
            }),
            orWhere: jest.fn(function (cb: any) { cb(nested); return nested; })
        };
        const query: any = {
            where: jest.fn(function (cb: any) { cb(nested); return query; }),
            update: jest.fn().mockReturnThis(),
            returning: jest.fn().mockResolvedValue([])
        };
        const transactionClient: any = jest.fn().mockReturnValue(query);
        const knex: any = {
            transaction: jest.fn().mockImplementation((callback: any) => callback(transactionClient))
        };
        const dao = new ImageDao({
            getConnection: jest.fn().mockResolvedValue(knex)
        } as any, {} as any);
        const now = 2000000000;
        const mockTime = jest.spyOn(Date, 'now').mockReturnValue(now);
        try {
            expect(await dao.expireStaleScanRuns()).toBe(0);
            expect(comparisons).toEqual([
                {status: 'processing', cutoff: now - 60 * 60 * 1000},
                {status: 'queued,published', cutoff: now - 24 * 60 * 60 * 1000}
            ]);
            expect(query.returning).toHaveBeenCalledWith(['image_id', 'cluster_id']);
        } finally {
            mockTime.mockRestore();
        }
    });
});
