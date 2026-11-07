import {UnauthorizedException} from '@nestjs/common';
import {AuthGuard} from './auth.guard';

describe('RC4 AuthGuard identity validation', () => {
  const context: any = {};
  const logger: any = {log: jest.fn()};

  it('permits an active authenticated profile', async () => {
    const guard = new AuthGuard({id: 42, isActive: true} as any, logger);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each([null, {}, {id: 0}, {id: -1}, {id: '42'}, {id: 42, isActive: false}])(
    'rejects missing, inactive or invalid identity %#', async (user) => {
      const guard = new AuthGuard(user as any, logger);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    }
  );
});
