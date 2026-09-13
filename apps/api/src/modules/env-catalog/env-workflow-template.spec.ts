import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENV_WORKFLOW_CONTENT, ENV_WORKFLOW_PATH } from './env-workflow-template';

/**
 * 같은 파일이 두 곳에 있다. 서버가 사용자 레포에 커밋하는 문자열과, 손으로 복사하는
 * 사람을 위해 저장소에 둔 files/templates/muster-env-build.yml이다.
 *
 * 갈라지면 「설치 버튼으로 넣은 레포」와 「문서 보고 넣은 레포」가 다르게 동작하는데,
 * 그 차이는 실행이 영영 running에 머무는 식으로만 드러나 원인을 찾기가 매우 어렵다.
 */
const TEMPLATE = join(__dirname, '../../../../../files/templates/muster-env-build.yml');

describe('환경 빌드 워크플로 템플릿', () => {
  it('저장소의 템플릿 파일과 한 글자도 다르지 않다', () => {
    expect(readFileSync(TEMPLATE, 'utf8')).toBe(ENV_WORKFLOW_CONTENT);
  });

  /** 이 두 줄이 계약이다 — 경로가 다르면 dispatch가 404, run-name이 다르면 대조가 깨진다. */
  it('실행기가 찾는 경로에 놓인다', () => {
    expect(ENV_WORKFLOW_PATH).toBe('.github/workflows/muster-env-build.yml');
  });

  it('run-name이 muster-env <구성 id> 형식이다', () => {
    expect(ENV_WORKFLOW_CONTENT).toContain('run-name: muster-env ${{ inputs.env_config_id }}');
  });

  it('workflow_dispatch로 env_config_id를 받는다 — 없으면 실행 자체가 불가능하다', () => {
    expect(ENV_WORKFLOW_CONTENT).toContain('workflow_dispatch:');
    expect(ENV_WORKFLOW_CONTENT).toContain('env_config_id:');
  });

  it('남의 레포에서 읽기 권한만 쓴다', () => {
    expect(ENV_WORKFLOW_CONTENT).toContain('contents: read');
    expect(ENV_WORKFLOW_CONTENT).toContain('push: false');
  });
});
