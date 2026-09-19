/**
 * 훅 원본을 muster-connect.mjs의 임베딩 상수에 도로 밀어 넣는다.
 *
 * `npx muster-connect`는 의존성 없이 한 파일로 돌아야 해서 훅 두 개를 base64 문자열로
 * 품고 있다. 그래서 훅을 고칠 때마다 이 사본도 같이 갱신해야 하는데, 지금까지는 손으로
 * 했다 — 빠뜨리면 사용자 기기에는 옛 훅이 깔리고, 화면의 숫자가 왜 안 맞는지 추적하기
 * 어려워진다(실제로 캐시 토큰 분리가 여기서 한 번 어긋났다).
 *
 *   node scripts/sync-embedded-hooks.mjs          # 갱신
 *   node scripts/sync-embedded-hooks.mjs --check  # 갱신이 필요한지만 확인 (CI용)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONNECT = join(__dirname, 'muster-connect.mjs');

const EMBEDS = [
  { constName: 'EMBEDDED_CLAUDE_HOOK', source: join(__dirname, 'claude-code-hooks/report-agent-usage.mjs') },
  { constName: 'EMBEDDED_ANTIGRAVITY_HOOK', source: join(__dirname, 'antigravity-hooks/report-agent-usage.mjs') },
];

const checkOnly = process.argv.includes('--check');
let connect = readFileSync(CONNECT, 'utf8');
const stale = [];

for (const { constName, source } of EMBEDS) {
  const encoded = Buffer.from(readFileSync(source, 'utf8'), 'utf8').toString('base64');
  const line = `export const ${constName} = Buffer.from("${encoded}", "base64").toString("utf8");`;

  // 상수 한 줄을 통째로 갈아 끼운다. base64는 " 를 포함하지 않으므로 이 패턴으로 충분하다.
  const pattern = new RegExp(`export const ${constName} = Buffer\\.from\\("[^"]*", "base64"\\)\\.toString\\("utf8"\\);`);
  if (!pattern.test(connect)) {
    console.error(`muster-connect.mjs에서 ${constName} 선언을 찾지 못했다.`);
    process.exit(2);
  }

  const current = connect.match(pattern)[0];
  if (current !== line) stale.push(constName);
  connect = connect.replace(pattern, line);
}

if (checkOnly) {
  if (stale.length > 0) {
    console.error(`임베딩 훅이 원본과 다르다: ${stale.join(', ')}\n  node scripts/sync-embedded-hooks.mjs 로 갱신할 것.`);
    process.exit(1);
  }
  console.log('임베딩 훅이 원본과 같다.');
  process.exit(0);
}

if (stale.length === 0) {
  console.log('이미 최신이다 — 바꾼 것 없음.');
} else {
  writeFileSync(CONNECT, connect, 'utf8');
  console.log(`갱신함: ${stale.join(', ')}`);
}
