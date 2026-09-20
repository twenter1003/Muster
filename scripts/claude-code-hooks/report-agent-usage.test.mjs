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

    assert.deepEqual(config, {
      apiUrl: 'https://local',
      apiKey: 'local-key',
      agentId: 'local-agent',
    });
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
    assert.equal(loadConfig(dir, {}, join(dir, 'no-global.json')), null);
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

test('sumUsageFromTranscript: assistant 메시지에서 model 필드를 추출한다', () => {
  withTempDir((dir) => {
    const file = join(dir, 'transcript.jsonl');
    const lines = [
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          model: 'claude-3-5-sonnet-20241022',
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      }),
    ];
    writeFileSync(file, lines.join('\n'));
    const result = sumUsageFromTranscript(file);
    assert.equal(result.model, 'claude-3-5-sonnet-20241022');
    assert.equal(result.tokens_used, 30);
  });
});

test('sumUsageFromTranscript: 파일이 없으면 0을 돌려준다 (예외를 던지지 않는다)', () => {
  const result = sumUsageFromTranscript('/no/such/file.jsonl');
  assert.deepEqual(result, {
    tokens_used: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    turns: 0,
    model: undefined,
    by_model: [],
  });
});

test('sumUsageFromTranscript: 세션 중 모델을 바꾸면 메시지별로 모델을 나눠 집계한다', () => {
  withTempDir((dir) => {
    const file = join(dir, 'transcript.jsonl');
    const lines = [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-09-20T00:00:00.000Z',
        message: {
          model: 'claude-sonnet-5',
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-09-20T00:05:00.000Z',
        message: {
          model: 'claude-opus-5',
          usage: { input_tokens: 200, output_tokens: 80 },
        },
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-09-20T00:06:00.000Z',
        message: {
          model: 'claude-opus-5',
          usage: { input_tokens: 20, output_tokens: 8 },
        },
      }),
    ];
    writeFileSync(file, lines.join('\n'));

    const result = sumUsageFromTranscript(file);
    // 하위 호환 필드는 여전히 "맨 처음 나온 모델"이다 — 단일 모델 세션(대다수)의
    // 하트비트 등에서 계속 쓰이므로 의미를 바꾸지 않는다.
    assert.equal(result.model, 'claude-sonnet-5');
    assert.equal(result.by_model.length, 2);

    const sonnet = result.by_model.find((b) => b.model === 'claude-sonnet-5');
    const opus = result.by_model.find((b) => b.model === 'claude-opus-5');
    assert.equal(sonnet.tokens_used, 150);
    assert.equal(opus.tokens_used, 308); // (200+80) + (20+8)
    assert.equal(opus.started_at, '2026-09-20T00:05:00.000Z');
    assert.equal(opus.ended_at, '2026-09-20T00:06:00.000Z');
  });
});

test('sumUsageFromTranscript: 캐시 토큰을 합치지 않고 종류별로 남긴다', () => {
  const file = join(tmpdir(), `muster-breakdown-${Date.now()}.jsonl`);
  writeFileSync(
    file,
    [
      JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-sonnet-5',
          usage: {
            input_tokens: 100,
            output_tokens: 200,
            cache_creation_input_tokens: 300,
            cache_read_input_tokens: 400,
          },
        },
      }),
    ].join('\n'),
  );

  const r = sumUsageFromTranscript(file);
  assert.equal(r.input_tokens, 100);
  assert.equal(r.output_tokens, 200);
  assert.equal(r.cache_write_tokens, 300);
  assert.equal(r.cache_read_tokens, 400);
  // 합계는 종전과 같은 의미를 유지한다 — 화면의 "토큰" 숫자가 이 값을 쓴다.
  assert.equal(r.tokens_used, 1000);
  rmSync(file, { force: true });
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

test('estimateCost: 캐시 읽기를 정규 입력가로 세지 않는다 — 이게 비용을 부풀리던 원인이다', () => {
  // 입력 10만 + 캐시쓰기 10만 + 캐시읽기 80만 + 출력 10만 (합계 110만)
  const usage = {
    tokens_used: 1_100_000,
    input_tokens: 100_000,
    cache_write_tokens: 100_000,
    cache_read_tokens: 800_000,
    output_tokens: 100_000,
  };
  const env = {
    MUSTER_COST_PER_MTOK_INPUT: '2',
    MUSTER_COST_PER_MTOK_OUTPUT: '10',
    MUSTER_COST_PER_MTOK_CACHE_READ: '0.2',
    MUSTER_COST_PER_MTOK_CACHE_WRITE: '2.5',
  };

  // 0.1*2 + 0.1*2.5 + 0.8*0.2 + 0.1*10 = 0.2 + 0.25 + 0.16 + 1.0 = 1.61
  assert.equal(estimateCost(usage, env), '1.610000');

  // 캐시 요율을 안 주면 캐시 토큰도 정규 입력가로 센다 — 싸게 보이게 지어내지 않는다.
  const noCacheRates = {
    MUSTER_COST_PER_MTOK_INPUT: '2',
    MUSTER_COST_PER_MTOK_OUTPUT: '10',
  };
  // 0.1*2 + 0.1*2 + 0.8*2 + 0.1*10 = 0.2 + 0.2 + 1.6 + 1.0 = 3.0
  assert.equal(estimateCost(usage, noCacheRates), '3.000000');
});
