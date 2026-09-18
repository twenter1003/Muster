import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseProto,
  loadConfig,
  sumUsageFromTranscript,
  normalizeAntigravityModel,
  getGitRemoteUrl,
} from './report-agent-usage.mjs';

test('Antigravity 훅: Protobuf 디코더', async (t) => {
  await t.test('varint 및 length-delimited 필드를 올바르게 파싱한다', () => {
    // tag 1 (varint = 1318): (1 << 3) | 0 = 0x08, 1318 = 0xa6 0x0a (38 + 10*128)
    // tag 2 (length-delimited = "test"): (2 << 3) | 2 = 0x12, len 4 = 0x04, "test"
    const buf = Buffer.from([0x08, 0xa6, 0x0a, 0x12, 0x04, 0x74, 0x65, 0x73, 0x74]);
    const fields = parseProto(buf);

    assert.equal(fields[1], 1318);
    assert.deepEqual(fields[2], Buffer.from('test'));
  });
});

test('Antigravity 훅: 설정 로더', async (t) => {
  await t.test('.muster/config.json에서 antigravity 에이전트 설정을 읽는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muster-test-'));
    try {
      const musterDir = join(dir, '.muster');
      mkdirSync(musterDir, { recursive: true });
      const config = {
        apiUrl: 'https://test.muster.app',
        apiKey: 'key_123',
        projectId: 'proj_123',
        agents: {
          'claude-code': 'agent_claude',
          antigravity: 'agent_antigravity',
        },
      };
      writeFileSync(join(dir, '.muster', 'config.json'), JSON.stringify(config));

      const loaded = loadConfig(dir, {});
      assert.deepEqual(loaded, {
        apiUrl: 'https://test.muster.app',
        apiKey: 'key_123',
        agentId: 'agent_antigravity',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await t.test('config가 없으면 환경변수로 폴백한다', () => {
    const env = {
      MUSTER_API_URL: 'https://env.muster.app',
      MUSTER_API_KEY: 'env_key',
      MUSTER_AGENT_ID: 'env_agent',
    };
    const loaded = loadConfig('/nonexistent', env);
    assert.deepEqual(loaded, {
      apiUrl: 'https://env.muster.app',
      apiKey: 'env_key',
      agentId: 'env_agent',
    });
  });

  await t.test('둘 다 없으면 null을 반환한다', () => {
    const loaded = loadConfig('/nonexistent', {}, '/nonexistent/config.json');
    assert.equal(loaded, null);
  });
});

test('Antigravity 훅: transcript 폴백 합산', async (t) => {
  await t.test('transcript.jsonl에서 턴 수 및 글자 기반 토큰을 추정한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muster-test-'));
    const transcriptPath = join(dir, 'transcript.jsonl');
    try {
      const lines = [
        JSON.stringify({
          step_index: 0,
          type: 'USER_INPUT',
          created_at: '2026-09-17T00:00:00Z',
          content: 'Hello Antigravity',
        }),
        JSON.stringify({
          step_index: 1,
          type: 'PLANNER_RESPONSE',
          created_at: '2026-09-17T00:01:00Z',
          thinking: 'Thinking about the answer',
          content: 'Here is the response',
        }),
      ];
      writeFileSync(transcriptPath, lines.join('\n'));

      const usage = sumUsageFromTranscript(transcriptPath);
      assert.equal(usage.turns, 2);
      assert.equal(usage.started_at, '2026-09-17T00:00:00Z');
      assert.equal(usage.ended_at, '2026-09-17T00:01:00Z');
      assert.ok(usage.tokens_used > 0);
      assert.equal(usage.model, 'gemini-3.8-flash');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await t.test('Model Selection 문자열에서 모델명을 추출한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muster-test-'));
    const transcriptPath = join(dir, 'transcript.jsonl');
    try {
      const lines = [
        JSON.stringify({
          step_index: 0,
          type: 'USER_INPUT',
          content: 'Switching model: `Model Selection` from auto to gemini-2.5-pro.',
        }),
      ];
      writeFileSync(transcriptPath, lines.join('\n'));
      const usage = sumUsageFromTranscript(transcriptPath);
      assert.equal(usage.model, 'gemini-2.5-pro');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await t.test('normalizeAntigravityModel: 모델 문자열을 표준 코드로 매핑한다', () => {
    assert.equal(normalizeAntigravityModel('gemini-3.8-flash-preview'), 'gemini-3.8-flash');
    assert.equal(normalizeAntigravityModel('gemini-2.5-pro'), 'gemini-2.5-pro');
    assert.equal(normalizeAntigravityModel('claude-3-5-sonnet'), 'claude-sonnet-5');
    assert.equal(normalizeAntigravityModel(null), 'gemini-3.8-flash');
  });
});

test('Antigravity 훅: git remote 추출', async (t) => {
  await t.test('현재 프로젝트 레포에서 git remote origin URL을 성공적으로 가져온다', () => {
    const url = getGitRemoteUrl(process.cwd());
    assert.ok(url);
    assert.match(url, /github\.com/);
  });

  await t.test('git 저장소가 아닌 디렉터리에서는 null을 반환한다', () => {
    const url = getGitRemoteUrl(tmpdir());
    assert.equal(url, null);
  });
});
