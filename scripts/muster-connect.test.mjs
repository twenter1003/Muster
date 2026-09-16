import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseArgs,
  registerClaudeHooks,
  registerAntigravityHooks,
  saveMusterConfig,
} from './muster-connect.mjs';

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
  });
});

test('muster-connect: registerClaudeHooks', async (t) => {
  await t.test('settings.json에 SessionStart 및 SessionEnd 훅을 등록한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-test-'));
    const settingsPath = join(dir, 'settings.json');
    try {
      const scriptPath = '/abs/path/to/report-agent-usage.mjs';
      registerClaudeHooks(scriptPath, settingsPath);

      const saved = JSON.parse(readFileSync(settingsPath, 'utf8'));
      assert.ok(saved.hooks.SessionStart.length > 0);
      assert.ok(saved.hooks.SessionEnd.length > 0);
      assert.match(saved.hooks.SessionStart[0].hooks[0].command, /report-agent-usage\.mjs/);

      // 재호출 시 중복 등록되지 않아야 한다
      registerClaudeHooks(scriptPath, settingsPath);
      const reSaved = JSON.parse(readFileSync(settingsPath, 'utf8'));
      assert.equal(reSaved.hooks.SessionStart[0].hooks.length, 1);
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
