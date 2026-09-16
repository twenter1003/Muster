#!/usr/bin/env node
//
// Muster Connect: 1줄 멀티 모델(Claude Code & Antigravity) 토큰 관제 연동 CLI
//
// 실행:
//   npx muster-connect
//   node scripts/muster-connect.mjs
//
// 외부 의존성(npm 패키지) 없이 Node.js 20+ 내장 모듈만으로 동작합니다 (Ponytail 원칙).

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseProto } from './antigravity-hooks/report-agent-usage.mjs';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const DEFAULT_MUSTER_URL = 'https://muster-xcswvn6m2q-du.a.run.app';

/** CLI 인자 파싱 (--url=..., --key=..., --project=..., --tools=..., --yes, --no-backfill, --global) */
export function parseArgs(argv) {
  const result = {
    url: null,
    key: null,
    project: null,
    tools: null, // 'claude' | 'antigravity' | 'both'
    yes: false,
    noBackfill: false,
    global: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--yes' || arg === '-y') result.yes = true;
    else if (arg === '--global' || arg === '-g') result.global = true;
    else if (arg === '--no-backfill') result.noBackfill = true;
    else if (arg.startsWith('--url=')) result.url = arg.slice(6);
    else if (arg.startsWith('--key=')) result.key = arg.slice(6);
    else if (arg.startsWith('--project=')) result.project = arg.slice(10);
    else if (arg.startsWith('--tools=')) result.tools = arg.slice(8);
  }

  return result;
}

/** ~/.muster/config.json 전역 설정 저장 (Git remote 기반 자동 라우팅용) */
export function saveGlobalMusterConfig({ apiUrl, apiKey }) {
  const musterDir = join(homedir(), '.muster');
  mkdirSync(musterDir, { recursive: true });

  const config = {
    apiUrl,
    apiKey,
  };

  writeFileSync(join(musterDir, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/** .muster/config.json 생성 및 .gitignore 갱신 */
export function saveMusterConfig(cwd, { apiUrl, apiKey, projectId, agents }) {
  const musterDir = join(cwd, '.muster');
  mkdirSync(musterDir, { recursive: true });

  const primaryAgentId = agents['claude-code'] || agents.antigravity || Object.values(agents)[0];

  const config = {
    apiUrl,
    apiKey,
    projectId,
    agents,
    agentId: primaryAgentId,
  };

  writeFileSync(join(musterDir, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');

  // .gitignore에 .muster/ 추가
  const gitignorePath = join(cwd, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8');
    if (!content.includes('.muster/')) {
      const updated = content.endsWith('\n') ? content + '.muster/\n' : content + '\n.muster/\n';
      writeFileSync(gitignorePath, updated, 'utf8');
    }
  } else {
    writeFileSync(gitignorePath, '.muster/\n', 'utf8');
  }
}

/** Claude Code settings.json 훅 등록 */
export function registerClaudeHooks(scriptPath, settingsPath) {
  const targetPath = settingsPath || join(homedir(), '.claude', 'settings.json');
  mkdirSync(join(targetPath, '..'), { recursive: true });

  let settings = {};
  if (existsSync(targetPath)) {
    try {
      settings = JSON.parse(readFileSync(targetPath, 'utf8'));
    } catch {
      settings = {};
    }
  }

  settings.hooks = settings.hooks || {};
  const hookCmd = `node "${scriptPath}"`;

  for (const event of ['SessionStart', 'SessionEnd']) {
    settings.hooks[event] = settings.hooks[event] || [];
    const exists = settings.hooks[event].some((h) =>
      h.hooks?.some((inner) => inner.command?.includes('report-agent-usage.mjs')),
    );
    if (!exists) {
      settings.hooks[event].push({
        matcher: '',
        hooks: [{ type: 'command', command: hookCmd }],
      });
    }
  }

  writeFileSync(targetPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

/** Antigravity hooks.json 훅 등록 */
export function registerAntigravityHooks(scriptPath, hooksPath) {
  const targetPath = hooksPath || join(homedir(), '.gemini', 'config', 'hooks.json');
  mkdirSync(join(targetPath, '..'), { recursive: true });

  let config = {};
  if (existsSync(targetPath)) {
    try {
      config = JSON.parse(readFileSync(targetPath, 'utf8'));
    } catch {
      config = {};
    }
  }

  const hookCmd = `node "${scriptPath}"`;

  // agy-customizations 규격: hooks.json 내 "muster-reporter": { "Stop": [ { "type": "command", "command": ... } ] }
  config['muster-reporter'] = config['muster-reporter'] || {};
  config['muster-reporter'].Stop = config['muster-reporter'].Stop || [];

  const exists = config['muster-reporter'].Stop.some((h) =>
    h.command?.includes('report-agent-usage.mjs'),
  );

  if (!exists) {
    config['muster-reporter'].Stop.push({
      type: 'command',
      command: hookCmd,
    });
  }

  writeFileSync(targetPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/** Claude Code 과거 세션 파일 스캔 */
export function scanClaudeSessions(projectName, baseDir) {
  const projectsRoot = baseDir || join(homedir(), '.claude', 'projects');
  if (!existsSync(projectsRoot)) return [];

  const matchingDirs = readdirSync(projectsRoot).filter((name) =>
    name.toLowerCase().includes(projectName.toLowerCase()),
  );

  const sessions = [];

  for (const dirName of matchingDirs) {
    const fullDir = join(projectsRoot, dirName);
    const files = readdirSync(fullDir).filter((f) => f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = join(fullDir, file);
      try {
        const content = readFileSync(filePath, 'utf8');
        let tokensUsed = 0;
        let turns = 0;
        let firstTimestamp = null;
        let lastTimestamp = null;

        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          const obj = JSON.parse(line);
          const ts = obj.timestamp ? new Date(obj.timestamp) : null;
          if (ts && !isNaN(ts.getTime())) {
            if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
            if (!lastTimestamp || ts > lastTimestamp) lastTimestamp = ts;
          }

          if (obj.type === 'assistant' && obj.message?.usage) {
            const u = obj.message.usage;
            tokensUsed +=
              (u.input_tokens || 0) +
              (u.output_tokens || 0) +
              (u.cache_read_input_tokens || 0) +
              (u.cache_creation_input_tokens || 0);
            turns++;
          }
        }

        if (tokensUsed > 0) {
          const stat = statSync(filePath);
          sessions.push({
            file,
            tokensUsed,
            turns,
            startedAt: (firstTimestamp || stat.birthtime || stat.mtime).toISOString(),
            endedAt: (lastTimestamp || stat.mtime).toISOString(),
          });
        }
      } catch {}
    }
  }

  return sessions;
}

/** Antigravity 과거 세션 DB 스캔 */
export function scanAntigravitySessions(projectName, convDir, summariesDbPath) {
  const conversationsRoot = convDir || join(homedir(), '.gemini', 'antigravity', 'conversations');
  const sumDbPath =
    summariesDbPath || join(homedir(), '.gemini', 'antigravity', 'conversation_summaries.db');

  if (!existsSync(conversationsRoot) && !existsSync(sumDbPath)) return [];

  const matchedConvIds = new Set();

  // 1. conversation_summaries.db가 있으면 작업 디렉터리 필터링
  if (existsSync(sumDbPath)) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const sumDb = new DatabaseSync(sumDbPath, { readOnly: true });
      const stmt = sumDb.prepare(
        'SELECT conversation_id, title, workspace_uris FROM conversation_summaries',
      );
      for (const row of stmt.all()) {
        const uris = row.workspace_uris || '';
        if (uris.toLowerCase().includes(projectName.toLowerCase())) {
          matchedConvIds.add(row.conversation_id);
        }
      }
      sumDb.close();
    } catch {}
  }

  // 2. 만약 매칭된 게 없다면 conversations 폴더의 모든 db 스캔 대상
  if (matchedConvIds.size === 0 && existsSync(conversationsRoot)) {
    for (const f of readdirSync(conversationsRoot)) {
      if (f.endsWith('.db') && !f.includes('summaries')) {
        matchedConvIds.add(f.replace('.db', ''));
      }
    }
  }

  const sessions = [];

  for (const convId of matchedConvIds) {
    const dbPath = join(conversationsRoot, `${convId}.db`);
    if (!existsSync(dbPath)) continue;

    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const stmt = db.prepare('SELECT idx, metadata FROM steps WHERE metadata IS NOT NULL');
      let totalInput = 0;
      let totalOutput = 0;
      let turns = 0;

      for (const row of stmt.all()) {
        if (!row.metadata) continue;
        const f = parseProto(Buffer.from(row.metadata));
        if (f[9]) {
          const sub = parseProto(f[9]);
          const inp = sub[2] || 0;
          const out = sub[3] || 0;
          if (inp || out) {
            totalInput += inp;
            totalOutput += out;
            turns++;
          }
        }
      }
      db.close();

      const totalTokens = totalInput + totalOutput;
      if (totalTokens > 0) {
        const stat = statSync(dbPath);
        sessions.push({
          conversationId: convId,
          tokensUsed: totalTokens,
          turns,
          startedAt: stat.birthtime?.toISOString() || stat.mtime.toISOString(),
          endedAt: stat.mtime.toISOString(),
        });
      }
    } catch {}
  }

  return sessions;
}

/** Muster REST API 통신 도우미 */
async function fetchApi(apiUrl, apiKey, path, method = 'GET', body = undefined) {
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`API 요청 실패 (${method} ${path}): ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** 대화형 메인 실행 함수 */
export async function runInteractive(args) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const cwd = process.cwd();
  const projectName = basename(cwd);

  try {
    console.log('\n======================================================');
    console.log('🚀 Muster Connect: 1줄 멀티 모델 토큰 관제 연동');
    console.log('======================================================\n');

    // 1. 기존 설정 확인
    let existingConfig = {};
    const localConfigPath = join(cwd, '.muster', 'config.json');
    if (existsSync(localConfigPath)) {
      try {
        existingConfig = JSON.parse(readFileSync(localConfigPath, 'utf8'));
      } catch {}
    }

    // 2. Muster URL 입력
    let apiUrl =
      args.url ||
      existingConfig.apiUrl ||
      (await rl.question(`Muster 서비스 URL [${DEFAULT_MUSTER_URL}]: `));
    apiUrl = (apiUrl.trim() || DEFAULT_MUSTER_URL).replace(/\/$/, '');
    if (!apiUrl.endsWith('/api/v1')) {
      apiUrl = `${apiUrl}/api/v1`;
    }

    // 3. API Key 입력
    let apiKey = args.key || existingConfig.apiKey;
    if (!apiKey) {
      apiKey = await rl.question('Muster 프로젝트 API Key: ');
      apiKey = apiKey.trim();
    }
    if (!apiKey) {
      console.error('❌ API Key가 필요합니다. Muster 프로젝트 화면에서 발급받아 입력해주세요.');
      process.exit(1);
    }

    // 4. API Key 검증 및 프로젝트/에이전트 조회
    console.log(`\n🔍 API Key 검증 중 (${apiUrl})...`);
    let agentsList = [];
    try {
      const res = await fetchApi(apiUrl, apiKey, '/agents');
      agentsList = res.items || [];
    } catch (err) {
      console.error(`❌ API Key 검증 실패: ${err.message}`);
      process.exit(1);
    }

    const projectId = existingConfig.projectId || agentsList[0]?.project_id;
    if (!projectId) {
      console.error('❌ 연결할 Project ID를 찾을 수 없습니다.');
      process.exit(1);
    }
    console.log(`✓ 인증 성공! 프로젝트 연결됨 (Project ID: ${projectId})`);

    // 4.1 전역 설정 모드 (--global)
    if (args.global) {
      saveGlobalMusterConfig({ apiUrl, apiKey });
      console.log(`✓ ~/.muster/config.json 전역 설정 저장 완료`);

      const claudeHookScript = resolve(__dirname, 'claude-code-hooks', 'report-agent-usage.mjs');
      registerClaudeHooks(claudeHookScript);
      console.log(`✓ Claude Code 전역 훅 등록 완료 (~/.claude/settings.json)`);

      const antigravityHookScript = resolve(__dirname, 'antigravity-hooks', 'report-agent-usage.mjs');
      registerAntigravityHooks(antigravityHookScript);
      console.log(`✓ Antigravity 전역 훅 등록 완료 (~/.gemini/config/hooks.json)`);

      console.log(`\n🎉 전역 1회 자동 라우팅 연동이 완료되었습니다!`);
      console.log(`   앞으로 어떤 Git 레포지토리에서든 Claude Code 또는 Antigravity로 작업하시면`);
      console.log(`   Git remote 주소를 통해 해당 Muster 프로젝트 대시보드로 토큰이 자동 집계됩니다.`);
      console.log(`   (개별 레포 폴더마다 muster-connect를 실행할 필요가 없습니다)\n`);
      rl.close();
      return;
    }

    // 5. 연동 대상 도구 선택
    console.log('\n연동할 AI 코딩 에이전트를 선택하세요:');
    console.log('  [1] Claude Code (Anthropic)');
    console.log('  [2] Antigravity (Google)');
    console.log('  [3] 둘 다 연동 (기본값)');
    let toolChoice = args.tools || (await rl.question('선택 [3]: '));
    toolChoice = toolChoice.trim() || '3';

    const enableClaude = toolChoice === '1' || toolChoice === '3' || toolChoice.toLowerCase() === 'both' || toolChoice.toLowerCase() === 'claude';
    const enableAntigravity = toolChoice === '2' || toolChoice === '3' || toolChoice.toLowerCase() === 'both' || toolChoice.toLowerCase() === 'antigravity';

    const agentsMap = { ...(existingConfig.agents || {}) };

    // 6. 에이전트 등록 확인/생성
    if (enableClaude && !agentsMap['claude-code']) {
      const existing = agentsList.find((a) => a.name === 'claude-code');
      if (existing) {
        agentsMap['claude-code'] = existing.id;
      } else {
        const created = await fetchApi(apiUrl, apiKey, `/projects/${projectId}/agents`, 'POST', {
          name: 'claude-code',
          config_md: '# Claude Code CLI Agent',
        });
        agentsMap['claude-code'] = created.id;
        console.log(`✓ Claude Code 에이전트 생성 완료 (${created.id})`);
      }
    }

    if (enableAntigravity && !agentsMap.antigravity) {
      const existing = agentsList.find((a) => a.name === 'antigravity');
      if (existing) {
        agentsMap.antigravity = existing.id;
      } else {
        const created = await fetchApi(apiUrl, apiKey, `/projects/${projectId}/agents`, 'POST', {
          name: 'antigravity',
          config_md: '# Google Antigravity Agent',
        });
        agentsMap.antigravity = created.id;
        console.log(`✓ Antigravity 에이전트 생성 완료 (${created.id})`);
      }
    }

    // 7. .muster/config.json 저장
    saveMusterConfig(cwd, {
      apiUrl,
      apiKey,
      projectId,
      agents: agentsMap,
    });
    console.log(`✓ .muster/config.json 설정 파일 저장 완료 (.gitignore 등록됨)`);

    // 8. 훅 등록
    if (enableClaude) {
      const claudeHookScript = resolve(__dirname, 'claude-code-hooks', 'report-agent-usage.mjs');
      registerClaudeHooks(claudeHookScript);
      console.log(`✓ Claude Code 전역 훅 등록 완료 (~/.claude/settings.json)`);
    }

    if (enableAntigravity) {
      const antigravityHookScript = resolve(__dirname, 'antigravity-hooks', 'report-agent-usage.mjs');
      registerAntigravityHooks(antigravityHookScript);
      // 프로젝트 로컬 .agents/hooks.json에도 등록
      registerAntigravityHooks(antigravityHookScript, join(cwd, '.agents', 'hooks.json'));
      console.log(`✓ Antigravity 훅 등록 완료 (~/.gemini/config/hooks.json & .agents/hooks.json)`);
    }

    // 9. 과거 세션 백필(Backfill)
    let doBackfill = args.yes || !args.noBackfill;
    if (!args.yes && !args.noBackfill) {
      const ans = await rl.question('\n과거 세션 이력을 Muster에 지금 백필하시겠습니까? (Y/n): ');
      doBackfill = ans.trim().toLowerCase() !== 'n';
    }

    if (doBackfill) {
      console.log('\n📦 과거 세션 로그 스캔 및 백필 시작...');

      if (enableClaude && agentsMap['claude-code']) {
        const claudeSessions = scanClaudeSessions(projectName);
        console.log(`- Claude Code 발견된 세션: ${claudeSessions.length}건`);
        let count = 0;
        let tokens = 0;
        for (const s of claudeSessions) {
          try {
            await fetchApi(apiUrl, apiKey, `/agents/${agentsMap['claude-code']}/runs`, 'POST', {
              status: 'succeeded',
              tokens_used: s.tokensUsed,
              cost: '0',
              started_at: s.startedAt,
              ended_at: s.endedAt,
            });
            count++;
            tokens += s.tokensUsed;
          } catch {}
        }
        console.log(`  ✓ Claude Code 백필 완료: ${count}개 세션 (${(tokens / 1_000_000).toFixed(2)}M 토큰)`);
      }

      if (enableAntigravity && agentsMap.antigravity) {
        const agySessions = scanAntigravitySessions(projectName);
        console.log(`- Antigravity 발견된 세션: ${agySessions.length}건`);
        let count = 0;
        let tokens = 0;
        for (const s of agySessions) {
          try {
            await fetchApi(apiUrl, apiKey, `/agents/${agentsMap.antigravity}/runs`, 'POST', {
              status: 'succeeded',
              tokens_used: s.tokensUsed,
              cost: '0',
              started_at: s.startedAt,
              ended_at: s.endedAt,
            });
            count++;
            tokens += s.tokensUsed;
          } catch {}
        }
        console.log(`  ✓ Antigravity 백필 완료: ${count}개 세션 (${(tokens / 1_000_000).toFixed(2)}M 토큰)`);
      }
    }

    console.log('\n🎉 모든 연동 설정이 성공적으로 완료되었습니다!');
    console.log(`이제 Claude Code 및 Antigravity 사용 시 토큰이 Muster 대시보드에 자동 집계됩니다.`);
    console.log(`대시보드 확인: ${apiUrl.replace('/api/v1', '')}/projects/${projectId}\n`);
  } finally {
    rl.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`
Muster Connect CLI

사용법:
  npx muster-connect [옵션]
  node scripts/muster-connect.mjs [옵션]

옵션:
  --url=<url>        Muster 서비스 API URL (기본값: ${DEFAULT_MUSTER_URL})
  --key=<api_key>    Muster 프로젝트 API Key
  --project=<id>     Muster Project ID
  --tools=<tools>    연동 도구 (claude | antigravity | both)
  --yes, -y          모든 확인 질문에 기본값으로 자동 응답
  --no-backfill      과거 세션 백필 건너뛰기
  --help, -h         도움말 출력
`);
    process.exit(0);
  }

  runInteractive(args).catch((err) => {
    console.error('\n❌ 연동 중 오류 발생:', err);
    process.exit(1);
  });
}
