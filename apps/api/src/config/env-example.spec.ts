import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envSchema } from './env.schema';

/**
 * .env.example이 스키마와 어긋나면 "값만 채우면 동작한다"가 깨진다.
 * 스키마에 키를 추가하고 example을 잊는 것이 가장 흔한 경로라 테스트로 고정한다.
 */
describe('.env.example ↔ env.schema', () => {
  const example = readFileSync(join(__dirname, '../../.env.example'), 'utf8');
  const exampleKeys = [...example.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]).sort();
  const schemaKeys = Object.keys(envSchema.shape).sort();

  it('두 목록이 정확히 일치한다', () => {
    expect(exampleKeys).toEqual(schemaKeys);
  });

  it('example에 실제 시크릿이 들어 있지 않다', () => {
    // 값이 채워진 채로 커밋되는 사고를 막는다.
    for (const key of ['GITHUB_OAUTH_CLIENT_SECRET', 'GITHUB_OAUTH_CLIENT_ID']) {
      expect(example).toMatch(new RegExp(`^${key}=\\s*$`, 'm'));
    }
  });
});
