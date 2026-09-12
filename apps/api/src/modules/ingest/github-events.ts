import { type DeploymentKind, type DeploymentStatus, type LogLevel } from '../../database/entities';

/** 이 웹훅이 남길 로그 한 줄. */
export interface LogDraft {
  level: LogLevel;
  message: string;
}

/** 이 웹훅이 남길 DEPLOYMENT_EVENTS 한 행 (DORA 입력). */
export interface DeploymentDraft {
  kind: DeploymentKind;
  status: DeploymentStatus;
  commit_sha: string;
  committed_at: Date | null;
  occurred_at: Date;
}

export interface WebhookInterpretation {
  log: LogDraft | null;
  deployment: DeploymentDraft | null;
}

const NOTHING: WebhookInterpretation = { log: null, deployment: null };

/**
 * 로그 한 줄의 상한. 서명이 유효하면 GitHub에서 온 것이 맞지만, PR 제목·커밋 메시지는
 * 사실상 길이 제한이 없다. 타임라인 한 줄에 수십 KB가 들어가면 조회 API가 먼저 무너진다.
 */
const MAX_MESSAGE = 500;

/**
 * GitHub 웹훅 페이로드를 **적재할 것**으로 번역한다. 순수 함수라 DB·네트워크 없이 검증된다.
 *
 * 설계서 Part 4 §7.1이 요구하는 것은 "커밋/PR 이벤트 수신 → LOG_ENTRIES 적재"와
 * DORA 입력(Part 3 240행: `deployment_status`/`workflow_run`)이다. 그 밖의 이벤트는
 * 조용히 무시한다 — 400을 돌려주면 GitHub이 재전송을 반복하는데, 우리가 구독하지 않는
 * 이벤트가 온 것은 오류가 아니라 정상이다.
 *
 * 진행 중 상태(pending/in_progress/queued, action != completed)도 적재하지 않는다.
 * DORA 4지표는 **끝난 배포**만 센다 (Part 2 §6.4).
 */
export function interpret(eventType: string, payload: unknown): WebhookInterpretation {
  const body = asRecord(payload);
  if (!body) return NOTHING;

  switch (eventType) {
    case 'push':
      return { log: pushLog(body), deployment: null };
    case 'pull_request':
      return { log: pullRequestLog(body), deployment: null };
    case 'deployment_status':
      return deploymentStatus(body);
    case 'workflow_run':
      return workflowRun(body);
    default:
      // ping을 포함한 나머지. 배달 기록만 남기고 끝낸다.
      return NOTHING;
  }
}

function pushLog(body: Record<string, unknown>): LogDraft {
  const ref = str(body.ref) ?? '(unknown ref)';
  const commits = Array.isArray(body.commits) ? body.commits.length : 0;
  const head = asRecord(body.head_commit);
  const title = firstLine(str(head?.message));

  const branch = ref.replace(/^refs\/heads\//, '');
  const suffix = title ? ` — ${title}` : '';
  return { level: 'info', message: clip(`push ${branch}: 커밋 ${commits}개${suffix}`) };
}

function pullRequestLog(body: Record<string, unknown>): LogDraft | null {
  const action = str(body.action);
  // 라벨 변경·리뷰 요청 등 잡음이 많다. 타임라인에 의미가 있는 전이만 남긴다.
  if (!action || !['opened', 'reopened', 'closed'].includes(action)) return null;

  const pr = asRecord(body.pull_request);
  const number = num(body.number) ?? num(pr?.number);
  const title = str(pr?.title) ?? '';
  const merged = pr?.merged === true;
  const verb = action === 'closed' ? (merged ? 'merged' : 'closed') : action;

  return { level: 'info', message: clip(`PR #${number ?? '?'} ${verb}: ${title}`) };
}

function deploymentStatus(body: Record<string, unknown>): WebhookInterpretation {
  const statusBody = asRecord(body.deployment_status);
  const state = str(statusBody?.state);
  // error와 failure를 함께 실패로 센다. GitHub은 배포 실행 실패(failure)와 상태 보고
  // 자체의 오류(error)를 나눠 보내지만, DORA 변경 실패율 관점에서는 둘 다 실패다.
  const status =
    state === 'success' ? 'success' : state === 'failure' || state === 'error' ? 'failure' : null;
  if (!status) return NOTHING;

  const deployment = asRecord(body.deployment);
  const sha = str(deployment?.sha);
  const occurred = date(str(statusBody?.created_at));
  if (!sha || !occurred) return NOTHING;

  const environment = str(deployment?.environment) ?? 'unknown';

  return {
    log: {
      level: status === 'success' ? 'info' : 'error',
      message: clip(
        `배포 ${status === 'success' ? '성공' : '실패'} (${environment}) ${short(sha)}`,
      ),
    },
    deployment: {
      kind: 'deployment',
      status,
      commit_sha: sha,
      // deployment_status 페이로드에는 커밋 시각이 없다. 지어내지 않고 null로 둔다 —
      // 이 행은 리드타임 집계에서만 빠진다 (deployment-event.entity.ts 주석 참조).
      committed_at: null,
      occurred_at: occurred,
    },
  };
}

function workflowRun(body: Record<string, unknown>): WebhookInterpretation {
  if (str(body.action) !== 'completed') return NOTHING;

  const run = asRecord(body.workflow_run);
  const conclusion = str(run?.conclusion);
  // cancelled·skipped·neutral은 성공도 실패도 아니다. 실패로 세면 변경 실패율이 부풀고,
  // 성공으로 세면 배포 빈도가 부풀어 양쪽 다 지표를 거짓으로 만든다. 빼는 게 맞다.
  const status =
    conclusion === 'success'
      ? 'success'
      : conclusion === 'failure' || conclusion === 'timed_out'
        ? 'failure'
        : null;
  if (!status) return NOTHING;

  const sha = str(run?.head_sha);
  const occurred = date(str(run?.updated_at));
  if (!sha || !occurred) return NOTHING;

  const name = str(run?.name) ?? 'workflow';
  const committed = date(str(asRecord(run?.head_commit)?.timestamp));

  return {
    log: {
      level: status === 'success' ? 'info' : 'error',
      message: clip(`${name} ${status === 'success' ? '성공' : '실패'} ${short(sha)}`),
    },
    deployment: {
      kind: 'workflow_run',
      status,
      commit_sha: sha,
      // 커밋이 실행 종료보다 늦게 찍힌 페이로드는 버린다 — DB CHECK가 어차피 거부하고,
      // 웹훅 전체를 500으로 떨어뜨리느니 리드타임만 포기하는 편이 낫다.
      committed_at: committed && committed <= occurred ? committed : null,
      occurred_at: occurred,
    },
  };
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

const date = (v: string | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const short = (sha: string) => sha.slice(0, 7);
const firstLine = (v: string | undefined) => v?.split('\n')[0]?.trim() || undefined;
const clip = (s: string) => (s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE - 1)}…` : s);
