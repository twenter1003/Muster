import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { ApiError, apiPost } from '../lib/api';
import { canRerun } from '../lib/envConfigRetry';
import { actorLabel, type TransitionView } from '../lib/transitions';
import { EM_DASH } from '../lib/domain';
import { useApi } from '../lib/useApi';
import {
  asBuildStatus,
  formatDateTime,
  type EnvConfigView,
  type PolicyCheckView,
} from './ProjectOverviewShared';

/* ─────────────────────── 환경 구성 → 서비스 카드 ─────────────────────── */

interface ServiceCard {
  key: string;
  role: string;
  name: string;
  detail: string;
  /** 도커 컨테이너가 아니라 외부 의존인가(주석 2 — 점선 카드). */
  external: boolean;
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * compose YAML의 최상위 services 이름만 뽑는다.
 * 왜 정규식인가: 새 의존성(YAML 파서)을 들일 수 없고, 여기서 필요한 것은 값 트리가 아니라
 * "어떤 서비스가 있는가" 한 줄뿐이다. 실패하면 빈 배열을 주고 stack_config 쪽으로 되돌아간다.
 */
function composeServiceNames(compose: unknown): string[] {
  if (typeof compose !== 'string') return [];
  const lines = compose.split('\n');
  const start = lines.findIndex((l) => /^services:\s*$/.test(l));
  if (start < 0) return [];

  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // 들여쓰기가 끝나면 services 블록도 끝난다.
    const m = /^\s{2}([A-Za-z0-9_.-]+):\s*$/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

/**
 * 서비스 카드를 만든다(주석 1).
 * stack_config는 사용자가 보낸 stack_input 그대로라 스키마가 고정돼 있지 않다. 그래서
 * (1) 알려진 키(language/framework/database/services)를 먼저 읽고
 * (2) 없으면 docker_config.compose의 서비스 이름으로 되돌아간다.
 * 둘 다 실패하면 카드를 만들지 않고 호출부가 "표시할 구성이 없다"고 적는다.
 */
function toServiceCards(stack: Record<string, unknown>, docker: Record<string, unknown> | null) {
  const cards: ServiceCard[] = [];

  const language = str(stack.language);
  const framework = str(stack.framework);
  if (language !== null || framework !== null) {
    cards.push({
      key: 'app',
      role: 'app',
      name: framework ?? language ?? EM_DASH,
      detail: [language, str(stack.port)].filter((v): v is string => v !== null).join(' · '),
      external: false,
    });
  }

  const database = str(stack.database);
  if (database !== null) {
    cards.push({ key: 'db', role: 'db', name: database, detail: '', external: false });
  }

  const extras = Array.isArray(stack.extra_services) ? stack.extra_services : [];
  for (const extra of extras) {
    const name = str(extra);
    if (name !== null) {
      cards.push({ key: `extra:${name}`, role: 'service', name, detail: '', external: false });
    }
  }

  if (cards.length === 0) {
    for (const name of composeServiceNames(docker?.compose)) {
      cards.push({
        key: `compose:${name}`,
        role: 'service',
        name,
        detail: 'compose',
        external: false,
      });
    }
  }

  /*
   * GCS는 구성에 적혀 있든 아니든 항상 있다 — 문서 업로드가 signed URL로 GCS에 직접 올린다
   * (DocStore). 컨테이너가 아니므로 점선 카드로 분리한다.
   */
  if (cards.length > 0) {
    cards.push({
      key: 'storage',
      role: 'storage',
      name: 'GCS 버킷',
      detail: 'docs/ · signed URL',
      external: true,
    });
  }

  return cards;
}

export function EnvConfigCard({
  config,
  docker,
  checks,
  retry,
}: {
  config: EnvConfigView;
  docker: Record<string, unknown> | null;
  checks: PolicyCheckView[] | null;
  /**
   * 재실행 갈래를 붙일지. 없으면 카드는 보기 전용이다.
   *
   * 프로젝트 id를 여기서 받는 이유: 목록 응답(EnvConfigView)에 project_id가 없고,
   * 이 카드를 그리는 화면은 어차피 자기가 어느 프로젝트인지 알고 있다. 없는 필드를
   * 서버에 요구하는 것보다 이미 아는 값을 내려 주는 편이 싸다.
   */
  retry?: { projectId: string; onChanged: () => void };
}) {
  const cards = toServiceCards(config.stack_config, docker);
  const status = asBuildStatus(config.build_status);

  /*
   * 전이 이력은 카드마다 자기 것을 부른다. 구성 하나당 몇 줄짜리 응답이고 화면에 뜨는 구성도
   * 스무 개를 넘지 않아, 한 번에 모아 받는 API를 새로 요구하는 것보다 이쪽이 싸다.
   */
  const transitions = useApi<{ items: TransitionView[] }>(`/env-configs/${config.id}/transitions`);
  const history = transitions.data?.items ?? [];

  const navigate = useNavigate();
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  /*
   * 실패한 구성에만 나오는 두 갈래.
   *
   * 다시 실행 — 실패의 상당수는 구성이 아니라 바깥 사정이다(권한·Actions 비활성·러너
   *   장애). 그럴 때 같은 값을 다시 입력하게 하면 실패 사본만 쌓인다. 서버가 failed에서
   *   실행을 받아 주므로 이 자리에서 끝난다.
   * 새로 만들기 — 설정 자체가 문제였다면 고쳐야 한다. 만들기 화면을 ?from=으로 열어
   *   이 구성의 값을 채워 준다. 라우터 state가 아니라 URL에 두는 이유는 새로고침·공유로
   *   날아가면 "그 설정으로 다시"라는 말이 성립하지 않기 때문이다.
   */
  const rerun = async () => {
    if (rerunning) return;
    setRerunning(true);
    setRerunError(null);
    try {
      await apiPost(`/env-configs/${config.id}/execute`);
      transitions.reload();
      retry?.onChanged();
    } catch (e: unknown) {
      setRerunError(e instanceof ApiError ? `${e.message} (${e.code})` : String(e));
    } finally {
      setRerunning(false);
    }
  };

  return (
    <>
      {cards.length === 0 ? (
        <p className="meta po-note">구성에서 서비스를 읽지 못했다.</p>
      ) : (
        <div className="po-services">
          {cards.map((c) => (
            <div
              key={c.key}
              className={c.external ? 'po-service po-service--external' : 'po-service'}
            >
              <span className="po-service__role">{c.role}</span>
              <span className="po-service__name">{c.name}</span>
              <span className="po-service__detail">{c.detail === '' ? EM_DASH : c.detail}</span>
              {/* 점선(색·형태)만으로는 부족하다. 외부 의존이라는 사실을 글자로도 남긴다. */}
              {c.external && <span className="po-service__role">외부 의존</span>}
            </div>
          ))}
        </div>
      )}

      {checks !== null && checks.length > 0 && (
        <p className="meta po-note">
          Policy Gate —{' '}
          {checks.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ' · '}
              <span className="po-mono">
                {c.tool} {c.verdict}
              </span>
            </span>
          ))}
        </p>
      )}
      {checks !== null &&
        checks
          .filter((c) => c.risk_notes !== null)
          .map((c) => (
            <p className="meta po-note" key={`note-${c.id}`}>
              {c.tool}: {c.risk_notes}
            </p>
          ))}

      {/*
        주석 3 — 지금 상태만이 아니라 여기까지 온 경로를 남긴다. 전에는 build_status 하나에서
        경로를 역산했는데, 그러면 반려 뒤 다시 통과한 구성이 처음부터 통과한 것처럼 보였다.
        이제는 서버가 기록한 전이를 그대로 잇는다 — 역산이 아니라 기록이다.
      */}
      {transitions.error !== null ? (
        <p className="meta po-note">전이 이력을 불러오지 못했다 — {transitions.error.message}</p>
      ) : (
        history.length > 0 && (
          <div className="po-transition">
            {history.map((t, i, arr) => {
              const to = asBuildStatus(t.to_status);
              return (
                <span key={t.id} title={`${actorLabel(t.actor)} · ${formatDateTime(t.created_at)}`}>
                  {i > 0 && <span aria-hidden="true"> {'>'} </span>}
                  {i === arr.length - 1 && to !== null ? <StatusBadge status={to} /> : t.to_status}
                </span>
              );
            })}
            {/* 행위자는 경로 옆에 붙인다 — 마지막 전이를 누가 했는지가 이 카드의 질문이다. */}
            <span className="po-transition__actor">
              마지막 {actorLabel(history[history.length - 1].actor)}
            </span>
          </div>
        )
      )}
      {/* 사유는 대개 비어 있고, 있을 때는 차단 이유라 감추면 안 된다. */}
      {history
        .filter((t) => t.reason !== null && t.reason.trim() !== '')
        .map((t) => (
          <p className="meta po-note" key={`reason-${t.id}`}>
            <span className="po-mono">{t.to_status}</span> — {t.reason}
          </p>
        ))}

      {/* 이력이 아직 없고 서버 상태만 아는 순간에도 상태 자체는 보여 준다. */}
      {history.length === 0 && transitions.error === null && status !== null && (
        <div className="po-transition">
          <StatusBadge status={status} />
        </div>
      )}

      {retry !== undefined && canRerun(config.build_status) && (
        <div className="po-listhead po-listhead--end">
          <Button variant="solid" onClick={rerun} disabled={rerunning}>
            {rerunning ? '실행 중…' : '다시 실행'}
          </Button>
          <Button
            onClick={() => navigate(`/projects/${retry.projectId}/env/new?from=${config.id}`)}
          >
            이 설정으로 새로 만들기
          </Button>
        </div>
      )}
      {rerunError !== null && (
        <p className="meta po-note po-note--signal" role="alert">
          {rerunError}
        </p>
      )}
    </>
  );
}
