import { envConfigIdFromRunName, RUN_NAME_PREFIX } from './env-config-executor';

const ID = '3f6c1a9e-2b47-4c81-9f0d-5a7e8c1b2d34';

/**
 * 실행 이름이 우리와 GitHub 사이의 유일한 대조 키다(`workflow_dispatch`는 실행 id를
 * 돌려주지 않는다). 여기가 느슨하면 남의 워크플로 결과로 우리 구성을 전이시키게 된다.
 */
describe('envConfigIdFromRunName', () => {
  it('우리가 만든 이름에서 구성 id를 읽는다', () => {
    expect(envConfigIdFromRunName(`${RUN_NAME_PREFIX}${ID}`)).toBe(ID);
  });

  it('앞뒤 공백은 허용한다 — GitHub이 run-name을 다듬어 보낼 수 있다', () => {
    expect(envConfigIdFromRunName(`${RUN_NAME_PREFIX} ${ID}  `)).toBe(ID);
  });

  it('사용자 레포의 다른 워크플로는 null이다', () => {
    expect(envConfigIdFromRunName('CI')).toBeNull();
    expect(envConfigIdFromRunName('build and deploy')).toBeNull();
  });

  it('접두사만 흉내 낸 이름은 받지 않는다', () => {
    // UUID가 아니면 우리 것이 아니다. 그대로 조회에 넘기면 DB가 오류를 낸다.
    expect(envConfigIdFromRunName(`${RUN_NAME_PREFIX}../../etc/passwd`)).toBeNull();
    expect(envConfigIdFromRunName(`${RUN_NAME_PREFIX}12345`)).toBeNull();
    expect(envConfigIdFromRunName(RUN_NAME_PREFIX)).toBeNull();
  });

  it('이름이 없어도 던지지 않는다', () => {
    expect(envConfigIdFromRunName(null)).toBeNull();
    expect(envConfigIdFromRunName(undefined)).toBeNull();
  });
});
