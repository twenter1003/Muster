import { Injectable } from '@nestjs/common';
import type { SessionResolver } from '../../common/auth/session-resolver';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SessionService } from './session.service';

/** Phase 1의 NullSessionResolver를 대체하는 실제 구현. */
@Injectable()
export class DbSessionResolver implements SessionResolver {
  constructor(private readonly sessions: SessionService) {}

  resolve(token: string): Promise<AuthenticatedUser | null> {
    return this.sessions.resolve(token);
  }
}
