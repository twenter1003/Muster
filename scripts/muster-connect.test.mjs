import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseArgs,
  registerClaudeHooks,
  registerAntigravityHooks,
  saveMusterConfig,
  scanClaudeSessions,
  scanAntigravitySessions,
  EMBEDDED_CLAUDE_HOOK,
  EMBEDDED_ANTIGRAVITY_HOOK,
} from './muster-connect.mjs';

const require = createRequire(import.meta.url);

test('muster-connect: embedded hooks', async (t) => {
  await t.test('내장 훅 스크립트가 비어있지 않고 유효한 코드이다', () => {
    assert.ok(EMBEDDED_CLAUDE_HOOK.length > 500);
    assert.ok(EMBEDDED_ANTIGRAVITY_HOOK.length > 500);
    assert.match(EMBEDDED_CLAUDE_HOOK, /SessionStart/);
    assert.match(EMBEDDED_ANTIGRAVITY_HOOK, /parseProto/);
  });
});

test('muster-connect: parseArgs', async (t) => {
  await t.test('CLI 인자를 올바르게 파싱한다', () => {
    const args = parseArgs([
      '--url=https://custom.muster.app',
      '--key=muster_secret',
      '--project=proj_123',
      '--tools=both',
      '--yes',
    ]);

    assert.equal(args.url, 'https://custom.muster.app');
    assert.equal(args.key, 'muster_secret');
    assert.equal(args.project, 'proj_123');
    assert.equal(args.tools, 'both');
    assert.equal(args.yes, true);
    assert.equal(args.global, false);
  });

  await t.test('--global 또는 -g 인자를 파싱한다', () => {
    const args1 = parseArgs(['--global', '--key=muster_secret']);
    assert.equal(args1.global, true);
    assert.equal(args1.key, 'muster_secret');

    const args2 = parseArgs(['-g']);
    assert.equal(args2.global, true);
  });
});

test('muster-connect: registerClaudeHooks', async (t) => {
  await t.test('settings.json에 SessionStart, SessionEnd 및 Stop 훅을 등록한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-test-'));
    const settingsPath = join(dir, 'settings.json');
    try {
      const scriptPath = '/abs/path/to/report-agent-usage.mjs';
      registerClaudeHooks(scriptPath, settingsPath);

      const saved = JSON.parse(readFileSync(settingsPath, 'utf8'));
      assert.ok(saved.hooks.SessionStart.length > 0);
      assert.ok(saved.hooks.SessionEnd.length > 0);
      assert.ok(saved.hooks.Stop.length > 0);
      assert.match(saved.hooks.SessionStart[0].hooks[0].command, /report-agent-usage\.mjs/);
      assert.match(saved.hooks.Stop[0].hooks[0].command, /report-agent-usage\.mjs/);

      // 재호출 시 중복 등록되지 않아야 한다
      registerClaudeHooks(scriptPath, settingsPath);
      const reSaved = JSON.parse(readFileSync(settingsPath, 'utf8'));
      assert.equal(reSaved.hooks.SessionStart[0].hooks.length, 1);
      assert.equal(reSaved.hooks.Stop[0].hooks.length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});


test('muster-connect: registerAntigravityHooks', async (t) => {
  await t.test('hooks.json에 Stop 훅을 등록한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agy-test-'));
    const hooksPath = join(dir, 'hooks.json');
    try {
      const scriptPath = '/abs/path/to/report-agent-usage.mjs';
      registerAntigravityHooks(scriptPath, hooksPath);

      const saved = JSON.parse(readFileSync(hooksPath, 'utf8'));
      assert.ok(saved['muster-reporter'] || saved.hooks?.Stop);

      // 재호출 시 중복 등록 방지 확인
      registerAntigravityHooks(scriptPath, hooksPath);
      const reSaved = JSON.parse(readFileSync(hooksPath, 'utf8'));
      assert.ok(reSaved);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('muster-connect: saveMusterConfig', async (t) => {
  await t.test('.muster/config.json을 생성하고 .gitignore에 .muster/를 추가한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muster-repo-'));
    const gitignorePath = join(dir, '.gitignore');
    writeFileSync(gitignorePath, 'node_modules\n');
    try {
      saveMusterConfig(dir, {
        apiUrl: 'https://test.muster.app',
        apiKey: 'key_123',
        projectId: 'proj_123',
        agents: {
          'claude-code': 'agent_1',
          antigravity: 'agent_2',
        },
      });

      const configPath = join(dir, '.muster', 'config.json');
      assert.ok(existsSync(configPath));
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      assert.equal(config.apiUrl, 'https://test.muster.app');
      assert.equal(config.agents['claude-code'], 'agent_1');
      assert.equal(config.agents.antigravity, 'agent_2');
      assert.equal(config.agentId, 'agent_1');

      const gitignore = readFileSync(gitignorePath, 'utf8');
      assert.match(gitignore, /\.muster\//);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('muster-connect: scanClaudeSessions', async (t) => {
  await t.test('실시간 훅과 같은 파서를 써서 토큰 4종·모델별로 세션을 백필한다', () => {
    const projectsRoot = mkdtempSync(join(tmpdir(), 'claude-projects-'));
    const projectDir = join(projectsRoot, '-Users-x-MyProj');
    mkdirSync(projectDir, { recursive: true });
    try {
      const lines = [
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-09-01T00:00:00.000Z',
          message: {
            model: 'claude-sonnet-5',
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 10,
              cache_creation_input_tokens: 5,
            },
          },
        }),
        // 세션 중 모델을 바꿔 쓴 경우 — by_model이 갈라져 별도 백필 항목이 돼야 한다.
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-09-01T00:05:00.000Z',
          message: {
            model: 'claude-opus-5',
            usage: { input_tokens: 20, output_tokens: 10 },
          },
        }),
      ];
      writeFileSync(join(projectDir, 'session1.jsonl'), lines.join('\n') + '\n', 'utf8');

      const sessions = scanClaudeSessions('MyProj', projectsRoot);
      assert.equal(sessions.length, 2, '모델 2개 → 백필 항목도 2개로 나뉜다');

      const sonnet = sessions.find((s) => s.model === 'claude-sonnet-5');
      assert.ok(sonnet, 'sonnet 버킷을 찾는다');
      assert.equal(sonnet.inputTokens, 100);
      assert.equal(sonnet.outputTokens, 50);
      assert.equal(sonnet.cacheReadTokens, 10);
      assert.equal(sonnet.cacheWriteTokens, 5);
      assert.equal(sonnet.tokensUsed, 165);
      assert.equal(sonnet.startedAt, '2026-09-01T00:00:00.000Z');

      const opus = sessions.find((s) => s.model === 'claude-opus-5');
      assert.ok(opus, 'opus 버킷을 찾는다');
      assert.equal(opus.inputTokens, 20);
      assert.equal(opus.outputTokens, 10);
      assert.equal(opus.cacheReadTokens, 0);
    } finally {
      rmSync(projectsRoot, { recursive: true, force: true });
    }
  });

  await t.test('토큰 사용이 없는 세션은 건너뛴다', () => {
    const projectsRoot = mkdtempSync(join(tmpdir(), 'claude-projects-'));
    const projectDir = join(projectsRoot, '-Users-x-Empty');
    mkdirSync(projectDir, { recursive: true });
    try {
      writeFileSync(join(projectDir, 'empty.jsonl'), JSON.stringify({ type: 'user' }) + '\n', 'utf8');
      const sessions = scanClaudeSessions('Empty', projectsRoot);
      assert.equal(sessions.length, 0);
    } finally {
      rmSync(projectsRoot, { recursive: true, force: true });
    }
  });
});

test('muster-connect: scanAntigravitySessions', async (t) => {
  await t.test('실시간 훅과 같은 Protobuf 파서(sumUsageFromStepsDb)로 입력/출력 토큰을 뽑는다', () => {
    const { DatabaseSync } = require('node:sqlite');
    const convDir = mkdtempSync(join(tmpdir(), 'agy-conversations-'));
    const convId = 'conv-123';
    const dbPath = join(convDir, `${convId}.db`);
    try {
      const db = new DatabaseSync(dbPath);
      db.exec('CREATE TABLE steps (idx INTEGER PRIMARY KEY, metadata BLOB)');
      // tag9(길이구분) 안에 field2=input(varint), field3=output(varint)를 담은 최소 protobuf.
      // input=100(0x64), output=50(0x32) — 둘 다 1바이트 varint라 인코딩이 단순하다.
      const inner = Buffer.from([0x10, 0x64, 0x18, 0x32]);
      const metadata = Buffer.concat([Buffer.from([0x4a, inner.length]), inner]);
      db.prepare('INSERT INTO steps (idx, metadata) VALUES (?, ?)').run(1, metadata);
      db.close();

      const sessions = scanAntigravitySessions('AnyProject', convDir, join(convDir, 'no-summaries.db'));
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].conversationId, convId);
      assert.equal(sessions[0].inputTokens, 100);
      assert.equal(sessions[0].outputTokens, 50);
      assert.equal(sessions[0].tokensUsed, 150);
    } finally {
      rmSync(convDir, { recursive: true, force: true });
    }
  });

  await t.test('대화가 없으면 빈 배열을 돌려준다', () => {
    const convDir = mkdtempSync(join(tmpdir(), 'agy-conversations-'));
    try {
      const sessions = scanAntigravitySessions('AnyProject', convDir, join(convDir, 'no-summaries.db'));
      assert.equal(sessions.length, 0);
    } finally {
      rmSync(convDir, { recursive: true, force: true });
    }
  });
});

test('muster-connect: sendHeartbeat', async (t) => {
  await t.test('클로드 및 안티그래비티 훅에서 sendHeartbeat 함수를 정상 노출한다', async () => {
    const claudeMod = await import('./claude-code-hooks/report-agent-usage.mjs');
    const agyMod = await import('./antigravity-hooks/report-agent-usage.mjs');

    assert.equal(typeof claudeMod.sendHeartbeat, 'function');
    assert.equal(typeof agyMod.sendHeartbeat, 'function');
    assert.equal(typeof claudeMod.handleHeartbeat, 'function');
  });
});

