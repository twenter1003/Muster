import { interpret } from './github-events';

const OCCURRED = '2026-09-09T10:00:00.000Z';
const COMMITTED = '2026-09-09T08:00:00.000Z';
const SHA = '0123456789abcdef0123456789abcdef01234567';

/**
 * DORA 지표(Part 2 §6.4)의 입력이 여기서 결정된다. 세면 안 되는 이벤트를 세는 순간
 * 배포 빈도·변경 실패율이 조용히 거짓이 되고, 그건 틀렸다는 표시도 없이 대시보드에 뜬다.
 */
describe('GitHub 웹훅 페이로드 해석', () => {
  describe('push', () => {
    it('커밋 수와 브랜치를 로그로 남긴다', () => {
      const { log, deployment } = interpret('push', {
        ref: 'refs/heads/main',
        commits: [{}, {}, {}],
        head_commit: { message: '로그 적재 구현\n\n상세 설명' },
      });

      expect(log).toEqual({ level: 'info', message: 'push main: 커밋 3개 — 로그 적재 구현' });
      expect(deployment).toBeNull();
    });

    it('배포 이벤트로는 세지 않는다', () => {
      // push는 배포가 아니다. 여기서 세면 배포 빈도가 커밋 빈도가 된다.
      expect(interpret('push', { ref: 'refs/heads/main', commits: [] }).deployment).toBeNull();
    });
  });

  describe('pull_request', () => {
    it('열림/닫힘/머지를 구분해 남긴다', () => {
      const closed = interpret('pull_request', {
        action: 'closed',
        number: 12,
        pull_request: { title: '가드를 common으로', merged: true },
      });
      expect(closed.log?.message).toBe('PR #12 merged: 가드를 common으로');

      const abandoned = interpret('pull_request', {
        action: 'closed',
        number: 13,
        pull_request: { title: '실험', merged: false },
      });
      expect(abandoned.log?.message).toBe('PR #13 closed: 실험');
    });

    it('라벨 변경 같은 잡음은 남기지 않는다', () => {
      expect(interpret('pull_request', { action: 'labeled', number: 1 }).log).toBeNull();
    });
  });

  describe('deployment_status', () => {
    const payload = (state: string) => ({
      deployment: { sha: SHA, environment: 'production' },
      deployment_status: { state, created_at: OCCURRED },
    });

    it('success를 성공 배포로 적재한다', () => {
      const { log, deployment } = interpret('deployment_status', payload('success'));

      expect(deployment).toEqual({
        kind: 'deployment',
        status: 'success',
        commit_sha: SHA,
        committed_at: null, // 페이로드에 커밋 시각이 없다 — 지어내지 않는다.
        occurred_at: new Date(OCCURRED),
      });
      expect(log).toEqual({ level: 'info', message: '배포 성공 (production) 0123456' });
    });

    it('error도 실패로 센다', () => {
      expect(interpret('deployment_status', payload('error')).deployment?.status).toBe('failure');
      expect(interpret('deployment_status', payload('failure')).deployment?.status).toBe('failure');
    });

    it('실패는 error 레벨로 남겨 로그 필터에 걸리게 한다', () => {
      expect(interpret('deployment_status', payload('failure')).log?.level).toBe('error');
    });

    it('진행 중 상태는 적재하지 않는다', () => {
      for (const state of ['pending', 'queued', 'in_progress']) {
        expect(interpret('deployment_status', payload(state))).toEqual({
          log: null,
          deployment: null,
        });
      }
    });

    it('occurred_at을 수신 시각이 아니라 페이로드 시각으로 잡는다', () => {
      // 웹훅이 늦게 도착하거나 재전송되면 둘이 벌어지고, 그 차이가 MTTR을 왜곡한다.
      const { deployment } = interpret('deployment_status', payload('success'));
      expect(deployment?.occurred_at.toISOString()).toBe(OCCURRED);
    });
  });

  describe('workflow_run', () => {
    const payload = (conclusion: string, extra: Record<string, unknown> = {}) => ({
      action: 'completed',
      workflow_run: {
        name: 'deploy',
        conclusion,
        head_sha: SHA,
        updated_at: OCCURRED,
        head_commit: { timestamp: COMMITTED },
        ...extra,
      },
    });

    it('completed + success를 적재하고 리드타임 시작점을 채운다', () => {
      const { deployment } = interpret('workflow_run', payload('success'));

      expect(deployment).toEqual({
        kind: 'workflow_run',
        status: 'success',
        commit_sha: SHA,
        committed_at: new Date(COMMITTED),
        occurred_at: new Date(OCCURRED),
      });
    });

    it('timed_out을 실패로 센다', () => {
      expect(interpret('workflow_run', payload('timed_out')).deployment?.status).toBe('failure');
    });

    it('cancelled·skipped는 성공으로도 실패로도 세지 않는다', () => {
      for (const conclusion of ['cancelled', 'skipped', 'neutral']) {
        expect(interpret('workflow_run', payload(conclusion)).deployment).toBeNull();
      }
    });

    it('아직 끝나지 않은 실행은 무시한다', () => {
      const running = { ...payload('success'), action: 'in_progress' };
      expect(interpret('workflow_run', running).deployment).toBeNull();
    });

    it('커밋 시각이 종료 시각보다 뒤면 버린다 (리드타임 음수 방지)', () => {
      const { deployment } = interpret(
        'workflow_run',
        payload('success', { head_commit: { timestamp: '2026-09-09T12:00:00.000Z' } }),
      );
      expect(deployment?.committed_at).toBeNull();
      expect(deployment?.status).toBe('success'); // 나머지 지표는 그대로 살린다.
    });
  });

  describe('그 밖', () => {
    it('구독하지 않는 이벤트는 조용히 넘어간다', () => {
      // 400을 주면 GitHub이 재전송을 반복한다. 우리가 안 보는 이벤트가 온 건 오류가 아니다.
      expect(interpret('ping', { zen: '...' })).toEqual({ log: null, deployment: null });
      expect(interpret('issues', { action: 'opened' })).toEqual({ log: null, deployment: null });
    });

    it('페이로드가 깨져 있어도 던지지 않는다', () => {
      for (const bad of [null, undefined, 'string', 42, []]) {
        expect(() => interpret('push', bad)).not.toThrow();
        expect(interpret('push', bad)).toEqual({ log: null, deployment: null });
      }
    });

    it('긴 제목은 잘라 낸다', () => {
      const { log } = interpret('pull_request', {
        action: 'opened',
        number: 1,
        pull_request: { title: 'x'.repeat(2000) },
      });
      expect(log!.message.length).toBe(500);
      expect(log!.message.endsWith('…')).toBe(true);
    });
  });
});
