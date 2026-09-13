/**
 * 환경 구성 실행 계약.
 *
 * 설계서 Part 4 §5.2는 실행 트리거만 정의하고 "무엇이 실행하는가"는 기술 사양서 9장의
 * 미해결 사항으로 남겼다. 그 자리를 이 인터페이스가 대신한다 — 호출부(EnvConfigsService)는
 * 실행 주체를 모르고, 실행 주체가 바뀌어도 상태 전이 규칙은 그대로다.
 * `DockerConfigGenerator`·`SecretStore`와 같은 패턴이다.
 *
 * 시작만 시키고 결과는 기다리지 않는다. 빌드는 분 단위인데 Cloud Run의 요청 타임아웃은
 * 60초라, 기다리는 설계는 애초에 성립하지 않는다. 결과는 웹훅으로 돌아온다.
 */
export interface EnvConfigExecutor {
  /**
   * 실행을 시작시킨다. 돌아오면 "시작을 접수시켰다"는 뜻이고, 성공을 뜻하지 않는다.
   * 시작조차 못 하면 던진다 — 그 경우 호출부가 구성을 failed로 되돌린다.
   */
  start(params: StartExecutionParams): Promise<void>;
}

export interface StartExecutionParams {
  /** 실행할 환경 구성. 실행 측이 결과를 돌려줄 때 이 id로 대조한다. */
  envConfigId: string;
  projectId: string;
  /** 실행을 누른 사람. 실행 측 자격증명(GitHub 토큰)의 주인이다. */
  userId: string;
  /**
   * 이번에 검증할 Dockerfile 본문. 실행 측에 실어 보낸다.
   *
   * 레포에 커밋된 Dockerfile을 빌드하지 않는 이유: 이 실행이 답해야 하는 물음은
   * "**Muster가 만든 이 구성**이 실제로 빌드되는가"다. 레포의 파일을 빌드하면 사용자가
   * 생성된 내용을 손으로 옮겨 적었을 때만 그 물음에 답이 되고, 옮기지 않으면 엉뚱한
   * 것을 검사하거나(다른 Dockerfile) 아예 실패한다(파일 없음).
   */
  dockerfile: string;
}

export const ENV_CONFIG_EXECUTOR = Symbol('ENV_CONFIG_EXECUTOR');

/**
 * 실행 측이 결과를 돌려줄 때 쓰는 이름표.
 *
 * `workflow_dispatch`는 만들어진 실행의 id를 돌려주지 않는다(GitHub API의 알려진 공백).
 * 그래서 실행 이름에 구성 id를 박아 보내고, 웹훅으로 돌아온 이름에서 다시 읽는다.
 * 접두사를 두는 이유는 사용자 레포의 다른 워크플로 실행과 섞이지 않게 하기 위해서다.
 */
export const RUN_NAME_PREFIX = 'muster-env ';

/** 실행 이름에서 환경 구성 id를 읽는다. 우리 것이 아니면 null. */
export function envConfigIdFromRunName(runName: string | null | undefined): string | null {
  if (!runName?.startsWith(RUN_NAME_PREFIX)) return null;

  const id = runName.slice(RUN_NAME_PREFIX.length).trim();
  // UUID가 아니면 우리가 만든 이름이 아니다. 그대로 조회에 넘기면 DB 오류가 난다.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
