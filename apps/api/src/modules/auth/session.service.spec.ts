import { Repository } from 'typeorm';
import { SessionService } from './session.service';
import type { Session, User } from '../../database/entities';
import { hashToken } from '../../common/auth/token-hash';

describe('SessionService', () => {
  let service: SessionService;
  let repo: jest.Mocked<Repository<Session>>;

  const mockUser: User = {
    id: 'user-1',
    github_login: 'octocat',
    email: 'octo@github.com',
  } as User;

  beforeEach(() => {
    repo = {
      save: jest.fn(),
      create: jest.fn((dto) => dto as Session),
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<Session>>;

    service = new SessionService(repo);
  });

  describe('issue', () => {
    it('새 토큰과 만료 시각을 발급하고 DB에 해시를 저장한다', async () => {
      repo.save.mockResolvedValue({} as Session);

      const { token, expires_at } = await service.issue('user-1');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(expires_at.getTime()).toBeGreaterThan(Date.now());
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          token_hash: hashToken(token),
        }),
      );
    });
  });

  describe('resolve with in-memory cache', () => {
    it('최초 조회 시 DB에서 세션을 가져오고 캐싱한다', async () => {
      const token = 'sample-valid-token-123';
      const expires = new Date(Date.now() + 100000);
      repo.findOne.mockResolvedValue({
        id: 's1',
        token_hash: hashToken(token),
        expires_at: expires,
        revoked_at: null,
        user: mockUser,
      } as Session);

      const user1 = await service.resolve(token);
      expect(user1).toEqual({
        id: 'user-1',
        github_login: 'octocat',
        email: 'octo@github.com',
      });
      expect(repo.findOne).toHaveBeenCalledTimes(1);

      // 두 번째 조회는 캐시에서 즉시 반환되므로 DB 조회가 일어나지 않아야 함 (0ms 단위 처리)
      const user2 = await service.resolve(token);
      expect(user2).toEqual(user1);
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('세션이 없거나 만료되었으면 null을 반환한다', async () => {
      repo.findOne.mockResolvedValue(null);
      const res = await service.resolve('non-existent-token');
      expect(res).toBeNull();
    });

    it('만료된 세션은 캐싱되지 않고 null을 반환한다', async () => {
      const token = 'expired-token';
      repo.findOne.mockResolvedValue({
        id: 's-expired',
        token_hash: hashToken(token),
        expires_at: new Date(Date.now() - 1000),
        revoked_at: null,
        user: mockUser,
      } as Session);

      const res = await service.resolve(token);
      expect(res).toBeNull();
    });
  });

  describe('revoke', () => {
    it('로그아웃 시 캐시를 무효화하고 DB를 갱신한다', async () => {
      const token = 'active-token-to-revoke';
      repo.findOne.mockResolvedValue({
        id: 's1',
        token_hash: hashToken(token),
        expires_at: new Date(Date.now() + 100000),
        revoked_at: null,
        user: mockUser,
      } as Session);

      // 1. 캐시 적재
      await service.resolve(token);
      expect(repo.findOne).toHaveBeenCalledTimes(1);

      // 2. 로그아웃 (revoke)
      await service.revoke(token);
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({ token_hash: hashToken(token) }),
        expect.objectContaining({ revoked_at: expect.any(Date) }),
      );

      // 3. 재조회 시 캐시에서 삭제되었으므로 DB를 다시 조회해야 함
      repo.findOne.mockResolvedValue(null);
      const afterRevoke = await service.resolve(token);
      expect(afterRevoke).toBeNull();
      expect(repo.findOne).toHaveBeenCalledTimes(2);
    });
  });
});
