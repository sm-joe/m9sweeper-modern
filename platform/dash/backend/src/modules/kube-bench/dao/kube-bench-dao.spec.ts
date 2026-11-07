import { KubeBenchDao } from './kube-bench-dao';

describe('kube-bench data isolation across clusters', () => {
  function daoWithMockQuery() {
    const calls: Array<[string, ...unknown[]]> = [];
    const query: any = {
      select: (...args: any[]) => {calls.push(['select', ...args]); return query;},
      from: (...args: any[]) => {calls.push(['from', ...args]); return query;},
      where: (...args: any[]) => {calls.push(['where', ...args]); return query;},
      count: (...args: any[]) => {calls.push(['count', ...args]); return Promise.resolve([{count: '3'}]);},
      orderBy: (...args: any[]) => {calls.push(['orderBy', ...args]); return query;},
      limit: (...args: any[]) => {calls.push(['limit', ...args]); return query;},
      offset: (...args: any[]) => {calls.push(['offset', ...args]); return query;},
      then: (fn: any) => Promise.resolve(fn([{id: 1,cluster_id: 7}]))
    };
    const knex: any = (...args: any[]) => {calls.push(['knex', ...args]);return query;};
    knex.select = query.select;
    const dao = new KubeBenchDao({getConnection: jest.fn().mockResolvedValue(knex)} as any, {} as any);
    return {dao,calls};
  }
  it('counts only results belonging to the requested cluster', async () => {
    const {dao,calls} = daoWithMockQuery();
    await expect(dao.countReport(7)).resolves.toBe('3');
    expect(calls).toContainEqual(['where','kb.cluster_id',7]);
  });
  it('returns only latest report for requested cluster, even with timestamp ties', async () => {
    const {dao,calls} = daoWithMockQuery();
    await dao.getLastBenchReportSummary(7);
    expect(calls).toContainEqual(['where','cluster_id',7]);
    expect(calls).toContainEqual(['orderBy','id','desc']);
    expect(calls).toContainEqual(['limit',1]);
  });
  it('caps oversized page limits and rejects negative offsets', async () => {
    const {dao,calls} = daoWithMockQuery();
    await dao.getAllBenchReportsByCluster(7, -5, 9999);
    expect(calls).toContainEqual(['where','cluster_id',7]);
    expect(calls).toContainEqual(['limit',100]);
    expect(calls).toContainEqual(['offset',0]);
  });
});
