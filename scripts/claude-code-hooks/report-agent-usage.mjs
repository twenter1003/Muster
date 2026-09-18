#!/usr/bin/env node
//
// Claude Code Stop/SessionStart 훅으로 실제 에이전트 실행을 Muster에 보고한다.
//
// 배경: AGENT_RUNS는 설계상 외부 에이전트가 X-API-Key로 직접 채워 넣는 자진신고
// 테이블인데(설계서 Part 4 §6), 지금까지 그 API를 실제로 호출하는 클라이언트가 없어서
// "토큰 사용량" 카드가 항상 0이었다. 이 스크립트가 그 클라이언트 중 하나다 —
// Claude Code 세션 시작/종료에 맞춰 실행을 시작·종료 기록한다.
//
// 실패해도 Claude Code 세션 자체를 막으면 안 된다. 그래서 무슨 일이 있어도 항상
// exit code 0으로 끝내고, 문제는 stderr에만 남긴다.
//
// 설치: docs/AGENT_TOKEN_REPORTING.md 참조.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 현재 작업 디렉터리의 git remote origin URL을 추출한다 (실패 시 null). */
export function getGitRemoteUrl(cwd) {
  try {
    const out = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/** 프로젝트 로컬 설정(.muster/config.json), 환경변수, 또는 전역 설정(~/.muster/config.json) 로드 */
export function loadConfig(
  cwd,
  env = process.env,
  globalPath = join(homedir(), '.muster', 'config.json'),
) {
  if (cwd) {
    const localPath = join(cwd, '.muster', 'config.json');
    if (existsSync(localPath)) {
      try {
        const parsed = JSON.parse(readFileSync(localPath, 'utf8'));
        const agentId = parsed.agents?.['claude-code'] || parsed.agentId;
        if (parsed.apiUrl && parsed.apiKey && agentId) {
          return { apiUrl: parsed.apiUrl, apiKey: parsed.apiKey, agentId };
        }
      } catch {
        // 손상된 설정 파일은 조용히 무시하고 환경변수로 폴백한다.
      }
    }
  }

  const { MUSTER_API_URL, MUSTER_API_KEY, MUSTER_AGENT_ID } = env;
  if (MUSTER_API_URL && MUSTER_API_KEY && MUSTER_AGENT_ID) {
    return { apiUrl: MUSTER_API_URL, apiKey: MUSTER_API_KEY, agentId: MUSTER_AGENT_ID };
  }

  // 3순위: 전역 설정 (~/.muster/config.json) — git remote 기반 자동 라우팅
  if (globalPath && existsSync(globalPath)) {
    try {
      const parsed = JSON.parse(readFileSync(globalPath, 'utf8'));
      if (parsed.apiUrl && parsed.apiKey) {
        return {
          apiUrl: parsed.apiUrl,
          apiKey: parsed.apiKey,
          agentId: parsed.agentId || null,
          isGlobal: true,
        };
      }
    } catch {}
  }

  return null;
}

/**
 * transcript JSONL에서 어시스턴트 턴의 usage를 모두 더한다.
 * 실측 확인(2026-09-16): 각 줄은 {type, message:{usage:{input_tokens, output_tokens,
 * cache_creation_input_tokens, cache_read_input_tokens}}, ...} 형태이고, type이
 * "assistant"인 줄에만 usage가 있다. 캐시 토큰도 실제로 쓴 용량이므로 합산에 포함한다.
 */
export function sumUsageFromTranscript(transcriptPath) {
  if (!existsSync(transcriptPath)) return { tokens_used: 0, output_tokens: 0, turns: 0, model: undefined };

  let inputSide = 0;
  let outputSide = 0;
  let turns = 0;
  let model;
  const lines = readFileSync(transcriptPath, 'utf8').split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'assistant') continue;
    if (!model && entry.message?.model) {
      model = entry.message.model;
    }
    const usage = entry.message?.usage;
    if (!usage) continue;

    inputSide +=
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    outputSide += usage.output_tokens ?? 0;
    turns += 1;
  }

  return { tokens_used: inputSide + outputSide, output_tokens: outputSide, turns, model };
}

/**
 * 두 요율(MUSTER_COST_PER_MTOK_INPUT/OUTPUT, 1M 토큰당 USD)이 모두 설정된 경우에만
 * 비용을 계산한다. 하나만 있거나 둘 다 없으면 undefined를 돌려주고 비용은 비워 둔다 —
 * 모델·플랜마다 다른 단가를 추측해서 채우지 않는다(memory: 기술 최신화 확인 원칙과
 * 같은 이유 — 근거 없는 숫자를 만들지 않는다).
 */
export function estimateCost(usage, env) {
  const inputRate = Number(env.MUSTER_COST_PER_MTOK_INPUT);
  const outputRate = Number(env.MUSTER_COST_PER_MTOK_OUTPUT);
  if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate)) return undefined;

  const inputSide = usage.tokens_used - usage.output_tokens;
  const cost = (inputSide / 1_000_000) * inputRate + (usage.output_tokens / 1_000_000) * outputRate;
  return cost.toFixed(6);
}

function statePathFor(sessionId) {
  return join(homedir(), '.muster', 'runs', `${sessionId}.json`);
}

async function apiCall(config, method, path, body) {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Muster API ${method} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function handleSessionStart(hook, env) {
  const statePath = statePathFor(hook.session_id);
  if (existsSync(statePath)) return; // 이미 시작 기록이 있다 — 컴팩션 등으로 다시 불린 경우.

  const config = loadConfig(hook.cwd, env);
  if (!config) return;

  if (config.isGlobal) {
    const gitRemote = getGitRemoteUrl(hook.cwd);
    if (!gitRemote) return;
    try {
      const run = await apiCall(config, 'POST', `/agent-runs/by-repo`, {
        repo_url: gitRemote,
        agent_name: 'claude-code',
        status: 'running',
        tokens_used: 0,
        cost: '0',
      });
      mkdirSync(join(homedir(), '.muster', 'runs'), { recursive: true });
      writeFileSync(statePath, JSON.stringify({ run_id: run.id, cwd: hook.cwd }), 'utf8');
    } catch (err) {
      process.stderr.write(`[Muster] Git 자동 라우팅 시작 건너뜀: ${err.message}\n`);
    }
    return;
  }

  const run = await apiCall(config, 'POST', `/agents/${config.agentId}/runs`, undefined);

  mkdirSync(join(homedir(), '.muster', 'runs'), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ run_id: run.id, cwd: hook.cwd }), 'utf8');
}

export async function sendHeartbeat(config, runId, tokensUsed, model) {
  return apiCall(config, 'PATCH', `/agent-runs/${runId}/heartbeat`, {
    tokens_used: tokensUsed,
    ...(model ? { model } : {}),
  });
}

export async function handleHeartbeat(hook, env) {
  const statePath = statePathFor(hook.session_id);
  if (!existsSync(statePath)) return;
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const config = loadConfig(state.cwd ?? hook.cwd, env);
  if (!config) return;

  const transcriptPath = hook.transcript_path || state.transcript_path;
  if (!transcriptPath || !existsSync(transcriptPath)) return;

  const usage = sumUsageFromTranscript(transcriptPath);
  if (usage.tokens_used <= (state.last_heartbeat_tokens || 0)) return;

  await sendHeartbeat(config, state.run_id, usage.tokens_used, usage.model);
  state.last_heartbeat_tokens = usage.tokens_used;
  writeFileSync(statePath, JSON.stringify(state), 'utf8');
}

async function handleSessionEnd(hook, env) {
  const statePath = statePathFor(hook.session_id);
  if (!existsSync(statePath)) return; // 대응하는 시작 기록이 없다 — 보고할 게 없다.

  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const config = loadConfig(state.cwd ?? hook.cwd, env);
  if (!config) {
    rmSync(statePath, { force: true });
    return;
  }

  const usage = sumUsageFromTranscript(hook.transcript_path);
  const cost = estimateCost(usage, env);

  await apiCall(config, 'PATCH', `/agent-runs/${state.run_id}`, {
    status: 'succeeded',
    tokens_used: usage.tokens_used,
    ...(usage.model ? { model: usage.model } : {}),
    ...(cost !== undefined ? { cost } : {}),
  });

  rmSync(statePath, { force: true });
}

async function main() {
  const raw = readFileSync(0, 'utf8');
  const hook = JSON.parse(raw);

  if (hook.hook_event_name === 'SessionStart') {
    await handleSessionStart(hook, process.env);
  } else if (hook.hook_event_name === 'SessionEnd') {
    await handleSessionEnd(hook, process.env);
  } else if (hook.hook_event_name === 'Stop' || hook.hook_event_name === 'PostToolUse') {
    await handleHeartbeat(hook, process.env);
  }
}


if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((err) => {
      process.stderr.write(`[muster-report-usage] ${err?.stack ?? err}\n`);
    })
    .finally(() => {
      process.exit(0); // 훅 실패로 Claude Code 세션을 막지 않는다.
    });
}
