#!/usr/bin/env node
/**
 * 로컬 Claude Code 세션 이력을 Muster DB의 agent_runs로 백필한다.
 *
 * 사용법:
 *   node scripts/backfill-claude-tokens.mjs [projectName]
 *
 * 기본값: "Muster"
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pg from '../apps/api/node_modules/pg/lib/index.js';

const { Client } = pg;

const projectName = process.argv[2] || 'Muster';
const claudeProjectDir = join(homedir(), `.claude/projects/-Users-kimtaewoo-${projectName}`);

if (!existsSync(claudeProjectDir)) {
  console.error(`Claude 프로젝트 폴더를 찾을 수 없습니다: ${claudeProjectDir}`);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres.cvicwscdjfpmcdtziyai:rocjswjf1003@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';

function parseSessionFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let tokensUsed = 0;
  let turns = 0;
  let firstTimestamp = null;
  let lastTimestamp = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
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
    } catch {
      // ignore
    }
  }

  const stat = statSync(filePath);
  if (!firstTimestamp) firstTimestamp = stat.birthtime || stat.mtime;
  if (!lastTimestamp) lastTimestamp = stat.mtime;

  return { tokensUsed, turns, startedAt: firstTimestamp, endedAt: lastTimestamp };
}

async function run() {
  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('supabase.com') ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    // 1. 프로젝트 조회
    const projectRes = await client.query('SELECT id, name FROM projects WHERE name = $1 LIMIT 1', [projectName]);
    if (projectRes.rows.length === 0) {
      console.error(`Muster DB에서 프로젝트 "${projectName}"를 찾을 수 없습니다.`);
      return;
    }
    const project = projectRes.rows[0];
    console.log(`프로젝트 찾음: ${project.name} (${project.id})`);

    // 2. 에이전트 확인 또는 생성
    let agentRes = await client.query(
      'SELECT id, name FROM agents WHERE project_id = $1 AND name = $2 LIMIT 1',
      [project.id, 'claude-code']
    );

    let agentId;
    if (agentRes.rows.length === 0) {
      const newAgent = await client.query(
        'INSERT INTO agents (project_id, name, config_md, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id',
        [project.id, 'claude-code', '# Claude Code CLI Agent']
      );
      agentId = newAgent.rows[0].id;
      console.log(`새 에이전트 생성됨: claude-code (${agentId})`);
    } else {
      agentId = agentRes.rows[0].id;
      console.log(`기존 에이전트 사용: claude-code (${agentId})`);
    }

    // 3. 세션 파일 수집
    const files = readdirSync(claudeProjectDir).filter((f) => f.endsWith('.jsonl'));
    console.log(`발견된 세션 로그 파일: ${files.length}개`);

    let insertedCount = 0;
    let totalTokensBackfilled = 0;

    for (const file of files) {
      const fullPath = join(claudeProjectDir, file);
      const parsed = parseSessionFile(fullPath);
      if (parsed.tokensUsed === 0) continue;

      // 중복 체크 (같은 agent_id와 동일한 started_at 및 tokens_used)
      const existing = await client.query(
        'SELECT id FROM agent_runs WHERE agent_id = $1 AND tokens_used = $2 AND started_at = $3 LIMIT 1',
        [agentId, parsed.tokensUsed, parsed.startedAt]
      );

      if (existing.rows.length > 0) {
        console.log(`  - 이미 등록됨 건너뜀: ${file} (${parsed.tokensUsed.toLocaleString()} 토큰)`);
        continue;
      }

      await client.query(
        `INSERT INTO agent_runs (agent_id, status, tokens_used, cost, started_at, ended_at)
         VALUES ($1, 'succeeded', $2, 0, $3, $4)`,
        [agentId, parsed.tokensUsed, parsed.startedAt, parsed.endedAt]
      );

      console.log(
        `  ✓ 백필 완료: ${file} | ${parsed.tokensUsed.toLocaleString()} 토큰 (${parsed.turns}턴) | ${parsed.startedAt.toISOString().slice(0, 10)}`
      );
      insertedCount++;
      totalTokensBackfilled += parsed.tokensUsed;
    }

    // 서브에이전트 로그 수집
    const subDirs = readdirSync(claudeProjectDir).filter((f) => {
      const p = join(claudeProjectDir, f);
      return statSync(p).isDirectory() && f !== 'memory';
    });

    for (const dir of subDirs) {
      const subPath = join(claudeProjectDir, dir, 'subagents');
      if (existsSync(subPath)) {
        const subFiles = readdirSync(subPath).filter((f) => f.endsWith('.jsonl'));
        for (const sf of subFiles) {
          const sParsed = parseSessionFile(join(subPath, sf));
          if (sParsed.tokensUsed === 0) continue;

          const existing = await client.query(
            'SELECT id FROM agent_runs WHERE agent_id = $1 AND tokens_used = $2 AND started_at = $3 LIMIT 1',
            [agentId, sParsed.tokensUsed, sParsed.startedAt]
          );
          if (existing.rows.length > 0) continue;

          await client.query(
            `INSERT INTO agent_runs (agent_id, status, tokens_used, cost, started_at, ended_at)
             VALUES ($1, 'succeeded', $2, 0, $3, $4)`,
            [agentId, sParsed.tokensUsed, sParsed.startedAt, sParsed.endedAt]
          );
          insertedCount++;
          totalTokensBackfilled += sParsed.tokensUsed;
        }
      }
    }

    console.log(`\n🎉 백필 완료! 총 ${insertedCount}개 세션, ${(totalTokensBackfilled / 1_000_000).toFixed(2)}M 토큰이 Muster DB에 성공적으로 등록되었습니다.`);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('백필 실행 중 오류 발생:', err);
  process.exit(1);
});
