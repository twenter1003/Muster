#!/usr/bin/env node
//
// Antigravity (Gemini CLI) Stop 훅으로 실제 세션 토큰 사용량을 Muster에 보고한다.
//
// Antigravity 세션 완료 시 .agents/hooks.json 또는 ~/.gemini/config/hooks.json에 등록된
// Stop 훅에 의해 실행된다.
// stdin으로 들어오는 conversationId, workspacePaths를 읽고,
// ~/.gemini/antigravity/conversations/${conversationId}.db (또는 transcript)에서
// 정확한 입출력 토큰을 집계하여 Muster API로 적재한다.
//
// 실패해도 세션을 방해하지 않도록 항상 exit code 0을 보장하고,
// stdout으로 {}를 출력한다.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

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

/** Protobuf varint 및 length-delimited 디코더 */
export function parseProto(buf) {
  let pos = 0;
  const fields = {};
  while (pos < buf.length) {
    let tag = 0;
    let shift = 0;
    while (pos < buf.length) {
      const b = buf[pos++];
      tag |= (b & 0x7f) << shift;
      shift += 7;
      if (!(b & 0x80)) break;
    }
    const fieldNum = tag >> 3;
    const wireType = tag & 0x07;
    if (wireType === 0) {
      // varint
      let val = 0;
      let vshift = 0;
      while (pos < buf.length) {
        const b = buf[pos++];
        val += (b & 0x7f) * Math.pow(2, vshift);
        vshift += 7;
        if (!(b & 0x80)) break;
      }
      fields[fieldNum] = val;
    } else if (wireType === 2) {
      // length-delimited
      let len = 0;
      let lshift = 0;
      while (pos < buf.length) {
        const b = buf[pos++];
        len += (b & 0x7f) * Math.pow(2, lshift);
        lshift += 7;
        if (!(b & 0x80)) break;
      }
      fields[fieldNum] = buf.subarray(pos, pos + len);
      pos += len;
    } else if (wireType === 1) {
      pos += 8;
    } else if (wireType === 5) {
      pos += 4;
    } else {
      break;
    }
  }
  return fields;
}

/** 프로젝트 로컬 설정(.muster/config.json), 환경변수, 또는 전역 설정(~/.muster/config.json) 로드 */
export function loadConfig(cwd, env = process.env) {
  if (cwd) {
    const localPath = join(cwd, '.muster', 'config.json');
    if (existsSync(localPath)) {
      try {
        const parsed = JSON.parse(readFileSync(localPath, 'utf8'));
        const agentId = parsed.agents?.antigravity || parsed.agentId;
        if (parsed.apiUrl && parsed.apiKey && agentId) {
          return { apiUrl: parsed.apiUrl, apiKey: parsed.apiKey, agentId };
        }
      } catch {
        // 무시하고 환경변수로 폴백
      }
    }
  }

  const { MUSTER_API_URL, MUSTER_API_KEY, MUSTER_AGENT_ID } = env;
  if (MUSTER_API_URL && MUSTER_API_KEY && MUSTER_AGENT_ID) {
    return { apiUrl: MUSTER_API_URL, apiKey: MUSTER_API_KEY, agentId: MUSTER_AGENT_ID };
  }

  // 3순위: 전역 설정 (~/.muster/config.json) — git remote 기반 자동 라우팅에 사용
  const globalPath = join(homedir(), '.muster', 'config.json');
  if (existsSync(globalPath)) {
    try {
      const parsed = JSON.parse(readFileSync(globalPath, 'utf8'));
      if (parsed.apiUrl && parsed.apiKey) {
        return { apiUrl: parsed.apiUrl, apiKey: parsed.apiKey, agentId: parsed.agentId || null, isGlobal: true };
      }
    } catch {}
  }

  return null;
}

/** transcript.jsonl 폴백 토큰 계산 */
export function sumUsageFromTranscript(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return { tokens_used: 0, turns: 0, started_at: null, ended_at: null };
  }

  let chars = 0;
  let turns = 0;
  let started_at = null;
  let ended_at = null;

  try {
    const lines = readFileSync(transcriptPath, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const ts = entry.created_at;
      if (ts) {
        if (!started_at) started_at = ts;
        ended_at = ts;
      }
      if (entry.content) chars += String(entry.content).length;
      if (entry.thinking) chars += String(entry.thinking).length;
      turns++;
    }
  } catch {
    // ignore
  }

  // 1 토큰 ~= 약 4자 (영어/코드 기준 근사치)
  const tokens_used = Math.round(chars / 4);
  return { tokens_used, turns, started_at, ended_at };
}

/** SQLite DB에서 Protobuf Tag 9 실측 토큰 추출 */
export function sumUsageFromDb(conversationId) {
  if (!conversationId) return null;
  const dbPath = join(homedir(), '.gemini/antigravity/conversations', `${conversationId}.db`);
  if (!existsSync(dbPath)) return null;

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
        const inputTokens = sub[2] || 0;
        const outputTokens = sub[3] || 0;
        if (inputTokens || outputTokens) {
          totalInput += inputTokens;
          totalOutput += outputTokens;
          turns++;
        }
      }
    }
    db.close();

    const totalTokens = totalInput + totalOutput;
    return { tokens_used: totalTokens, turns, started_at: null, ended_at: null };
  } catch {
    return null;
  }
}

export function extractAntigravityUsage(conversationId, transcriptPath) {
  const dbUsage = sumUsageFromDb(conversationId);
  const transcriptUsage = sumUsageFromTranscript(transcriptPath);

  if (dbUsage && dbUsage.tokens_used > 0) {
    return {
      tokens_used: dbUsage.tokens_used,
      turns: dbUsage.turns,
      started_at: transcriptUsage.started_at || new Date().toISOString(),
      ended_at: transcriptUsage.ended_at || new Date().toISOString(),
    };
  }

  return transcriptUsage;
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

export async function handleStop(hook, env = process.env) {
  const cwd = hook.workspacePaths?.[0] || process.cwd();
  const config = loadConfig(cwd, env);
  if (!config) return;

  const conversationId = hook.conversationId;
  if (!conversationId) return;

  const usage = extractAntigravityUsage(conversationId, hook.transcriptPath);
  if (!usage || usage.tokens_used === 0) return;

  const stateDir = join(homedir(), '.muster', 'antigravity-runs');
  mkdirSync(stateDir, { recursive: true });
  const statePath = join(stateDir, `${conversationId}.json`);

  let runId = null;
  let lastTokens = 0;
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      runId = state.run_id;
      lastTokens = state.tokens_used || 0;
    } catch {}
  }

  // 토큰 변화가 없으면 API 호출 생략
  if (runId && usage.tokens_used === lastTokens) {
    return;
  }

  if (!runId) {
    let run;
    if (config.isGlobal) {
      const gitRemote = getGitRemoteUrl(cwd);
      if (!gitRemote) return; // git 레포가 아니면 리포팅하지 않음
      try {
        run = await apiCall(config, 'POST', `/agent-runs/by-repo`, {
          repo_url: gitRemote,
          agent_name: 'antigravity',
          status: 'succeeded',
          tokens_used: usage.tokens_used,
          cost: '0',
          started_at: usage.started_at,
          ended_at: usage.ended_at,
        });
      } catch (err) {
        process.stderr.write(`[Muster] Git 자동 라우팅 리포팅 건너뜀: ${err.message}\n`);
        return;
      }
    } else {
      run = await apiCall(config, 'POST', `/agents/${config.agentId}/runs`, {
        status: 'succeeded',
        tokens_used: usage.tokens_used,
        cost: '0',
        started_at: usage.started_at,
        ended_at: usage.ended_at,
      });
    }
    writeFileSync(
      statePath,
      JSON.stringify({ run_id: run.id, tokens_used: usage.tokens_used, cwd }),
      'utf8',
    );
  } else {
    await apiCall(config, 'PATCH', `/agent-runs/${runId}`, {
      status: 'succeeded',
      tokens_used: usage.tokens_used,
    });
    writeFileSync(
      statePath,
      JSON.stringify({ run_id: runId, tokens_used: usage.tokens_used, cwd }),
      'utf8',
    );
  }
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
  if (!raw.trim()) {
    process.stdout.write('{}\n');
    return;
  }

  let hook;
  try {
    hook = JSON.parse(raw);
  } catch {
    process.stdout.write('{}\n');
    return;
  }

  await handleStop(hook, process.env);
  process.stdout.write('{}\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((err) => {
      process.stderr.write(`[muster-antigravity-hook] ${err?.stack ?? err}\n`);
    })
    .finally(() => {
      process.exit(0);
    });
}
