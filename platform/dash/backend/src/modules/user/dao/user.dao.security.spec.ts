import {UserDao} from './user.dao';

// This test checks the SQL builder constraints, not a substitute for live
// disabled-account/revoked-key Kubernetes ingestion validation.
jest.mock('knexnest', () => jest.fn().mockResolvedValue([]));

describe('P0 scanner API-key user lifecycle', () => {
  it('filters out disabled and soft-deleted users, and inactive keys', async () => {
    const builder: any = {
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis()
    };
    const knex: any = {select: jest.fn().mockReturnValue(builder)};
    const dao = new UserDao({getConnection: jest.fn().mockResolvedValue(knex)} as any);
    await dao.loadUserByApiKey('test-key-not-a-real-secret');
    expect(builder.andWhere).toHaveBeenCalledWith('ak.is_active', '=', true);
    expect(builder.andWhere).toHaveBeenCalledWith('u.is_active', '=', true);
    expect(builder.whereNull).toHaveBeenCalledWith('u.deleted_at');
    expect(builder.andWhere).toHaveBeenCalledWith('user_auth.active', '=', 'true');
  });
});
