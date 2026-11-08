import {CanActivate, ExecutionContext, Inject, Injectable} from '@nestjs/common';
import {UserProfileDto} from '../modules/user/dto/user-profile-dto';
import {Reflector} from '@nestjs/core';

@Injectable()
export class AuthorityGuard implements CanActivate {

  constructor(@Inject('LOGGED_IN_USER') private readonly _loggedInUser: UserProfileDto,
              private reflector: Reflector){}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const allowedAuthorities: string[] = <string[]> this.reflector.get<string[]>('allowedAuthorities', context.getHandler());
    // Missing identity, authority metadata or malformed authority objects must deny.
    if (!Array.isArray(allowedAuthorities) || allowedAuthorities.length === 0 ||
        !this._loggedInUser || !Array.isArray(this._loggedInUser.authorities)) {
      return false;
    }
    return this._loggedInUser.authorities.some(authority =>
      !!authority && typeof authority.type === 'string' && allowedAuthorities.includes(authority.type));
  }
}
