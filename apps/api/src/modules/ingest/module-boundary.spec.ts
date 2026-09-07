import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const INGEST_DIR = __dirname;
const FORBIDDEN = [
  'auth',
  'project-core',
  'doc-store',
  'env-catalog',
  'agent-registry',
  'realtime',
];

function collectTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return collectTsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * 지시서 원칙 4 / TechSpec 8장: Ingest는 다른 모듈을 직접 호출하지 않는다.
 * 린터 규칙과 별개로, 린트를 건너뛴 채 머지되는 경우를 테스트로도 막는다.
 */
describe('Ingest 모듈 경계', () => {
  const files = collectTsFiles(INGEST_DIR).filter((f) => !f.endsWith('module-boundary.spec.ts'));

  it('검사 대상 파일이 최소 1개는 있다', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)('%s 모듈을 import하지 않는다', (moduleName) => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      // 절대 경로(src/modules/auth/...)와 상대 경로(../auth/...) 양쪽을 잡는다.
      return new RegExp(
        `from\\s+['"](?:[^'"]*modules/${moduleName}/|\\.\\./${moduleName}/)`,
      ).test(source);
    });
    expect(offenders).toEqual([]);
  });
});
