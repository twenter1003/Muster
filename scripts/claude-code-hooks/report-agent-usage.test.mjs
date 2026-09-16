// node --test scripts/claude-code-hooks/report-agent-usage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, sumUsageFromTranscript, estimateCost } from './report-agent-usage.mjs';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'muster-hook-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('loadConfig: .muster/config.json이 있으면 환경변수보다 우선한다', () => {
  withTempDir((dir) => {
    const musterDir = join(dir, '.muster');
    mkdirSync(musterDir);
    writeFileSync(
      join(musterDir, 'config.json'),
      JSON.stringify({ apiUrl: 'https://local', apiKey: 'local-key', agentId: 'local-agent' }),
    );

    const config = loadConfig(dir, {
      MUSTER_API_URL: 'https://env',
      MUSTER_API_KEY: 'env-key',
      MUSTER_AGENT_ID: 'env-agent',
    });

    assert.deepEqual(config, { apiUrl: 'https://local', apiKey: 'local-key', agentId: 'local-agent' });
  });
});

test('loadConfig: 로컬 설정이 없으면 환경변수로 폴백한다', () => {
  withTempDir((dir) => {
    const config = loadConfig(dir, {
      MUSTER_API_URL: 'https://env',
      MUSTER_API_KEY: 'env-key',
      MUSTER_AGENT_ID: 'env-agent',
    });
    assert.deepEqual(config, { apiUrl: 'https://env', apiKey: 'env-key', agentId: 'env-agent' });
  });
});

test('loadConfig: 아무것도 없으면 null — 무관한 레포는 조용히 건너뛴다', () => {
  withTempDir((dir) => {
    assert.equal(loadConfig(dir, {}), null);
  });
});

test('sumUsageFromTranscript: assistant 턴의 usage 네 필드를 모두 더한다', () => {
  withTempDir((dir) => {
    const file = join(dir, 'transcript.jsonl');
    const lines = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          usage: {
            input_tokens: 2,
            output_tokens: 247,
            cache_creation_input_tokens: 26689,
            cache_read_input_tokens: 42899,
          },
        },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', usage: { input_tokens: 5, output_tokens: 10 } },
      }),
      '', // 빈 줄은 건너뛴다
      'not json', // 손상된 줄도 건너뛴다
    ];
    writeFileSync(file, lines.join('\n'));

    const result = sumUsageFromTranscript(file);
    assert.equal(result.turns, 2);
    assert.equal(result.output_tokens, 257);
    assert.equal(result.tokens_used, 2 + 247 + 26689 + 42899 + 5 + 10);
  });
});

test('sumUsageFromTranscript: 파일이 없으면 0을 돌려준다 (예외를 던지지 않는다)', () => {
  const result = sumUsageFromTranscript('/no/such/file.jsonl');
  assert.deepEqual(result, { tokens_used: 0, output_tokens: 0, turns: 0 });
});

test('estimateCost: 요율이 둘 다 있어야 계산하고, 하나라도 없으면 undefined다', () => {
  const usage = { tokens_used: 1_000_000, output_tokens: 200_000 };

  assert.equal(estimateCost(usage, {}), undefined);
  assert.equal(estimateCost(usage, { MUSTER_COST_PER_MTOK_INPUT: '3' }), undefined);

  const cost = estimateCost(usage, {
    MUSTER_COST_PER_MTOK_INPUT: '3',
    MUSTER_COST_PER_MTOK_OUTPUT: '15',
  });
  // 입력측 80만 토큰 * $3/M + 출력 20만 토큰 * $15/M = 2.4 + 3.0 = 5.4
  assert.equal(cost, '5.400000');
});
