import { Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PolicyCheck, PolicyGate, PolicyGateInput } from './policy-gate';

const run = promisify(execFile);

/** 검사가 매달리면 요청도 매달린다. 도커 설정 검사는 초 단위로 끝나야 한다. */
const TIMEOUT_MS = 60_000;

/**
 * Trivy와 Conftest를 실제로 돌리는 구현 (설계서 Part 2 §6.1).
 *
 * 두 도구 모두 파일을 입력으로 받으므로 임시 디렉터리에 써서 넘긴다. 셸을 거치지 않고
 * execFile로 인자 배열을 직접 넘긴다 — LLM이 만든 문자열이 파일 **내용**으로만 들어가고
 * 명령줄로 새지 않게 한다.
 */
export class CliPolicyGate implements PolicyGate {
  private readonly logger = new Logger(CliPolicyGate.name);

  constructor(private readonly policyDir: string) {}

  async run(input: PolicyGateInput): Promise<PolicyCheck[]> {
    const dir = await mkdtemp(join(tmpdir(), 'muster-policy-'));

    try {
      await writeFile(join(dir, 'Dockerfile'), input.dockerfile, 'utf8');
      if (input.compose) {
        await writeFile(join(dir, 'docker-compose.yml'), input.compose, 'utf8');
      }

      // 한쪽이 실패해도 다른 쪽 결과는 남긴다 — 어느 도구가 무엇을 잡았는지가 기록의 목적이다.
      const [trivy, conftest] = await Promise.all([
        this.runTrivy(dir),
        this.runConftest(dir, input.compose !== null),
      ]);

      return [trivy, conftest];
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Trivy config 스캔 — Dockerfile/compose의 표준 설정 오류를 본다. */
  private async runTrivy(dir: string): Promise<PolicyCheck> {
    try {
      const { stdout } = await run(
        'trivy',
        ['config', '--quiet', '--format', 'json', '--severity', 'HIGH,CRITICAL', dir],
        { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      );

      const findings = parseTrivy(stdout);
      return {
        tool: 'trivy',
        verdict: findings.length ? 'fail' : 'pass',
        risk_notes: findings.length ? findings.join('\n') : null,
      };
    } catch (error) {
      return this.toolFailure('trivy', error);
    }
  }

  /** Conftest — 이 플랫폼의 커스텀 규칙 (포트·리소스·이미지 소스). */
  private async runConftest(dir: string, hasCompose: boolean): Promise<PolicyCheck> {
    // compose가 없으면 검사할 입력이 없다. 규칙이 compose 구조를 대상으로 하기 때문이다.
    // 이때 "통과"라고 답하면 아무것도 검사하지 않고 통과시킨 것이 되므로 그 사실을 남긴다.
    if (!hasCompose) {
      return {
        tool: 'conftest',
        verdict: 'pass',
        risk_notes: 'compose 파일이 없어 커스텀 규칙 검사를 건너뛰었습니다.',
      };
    }

    try {
      const { stdout } = await run(
        'conftest',
        ['test', '--policy', this.policyDir, '--output', 'json', join(dir, 'docker-compose.yml')],
        { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      );
      return this.conftestResult(stdout);
    } catch (error) {
      // conftest는 위반이 있으면 종료 코드 1로 끝난다. 그건 실패가 아니라 **판정**이다.
      const e = error as { code?: number; stdout?: string };
      if (e.code === 1 && typeof e.stdout === 'string') {
        return this.conftestResult(e.stdout);
      }
      return this.toolFailure('conftest', error);
    }
  }

  private conftestResult(stdout: string): PolicyCheck {
    const { failures, warnings } = parseConftest(stdout);
    // 판정은 failures만 뒤집는다. 경고는 사람이 보라고 남기되 게이트를 막지는 않는다.
    const notes = [...failures, ...warnings.map((w) => `(경고) ${w}`)];
    return {
      tool: 'conftest',
      verdict: failures.length ? 'fail' : 'pass',
      risk_notes: notes.length ? notes.join('\n') : null,
    };
  }

  /**
   * 도구가 아예 돌지 못한 경우.
   *
   * **fail로 처리한다.** 검사하지 못한 구성을 통과시키면 Policy Gate가 있으나 마나다 —
   * 도구를 죽이는 것만으로 게이트를 열 수 있게 된다.
   */
  private toolFailure(tool: 'trivy' | 'conftest', error: unknown): PolicyCheck {
    this.logger.error(`${tool} 실행 실패: ${String(error)}`);
    return {
      tool,
      verdict: 'fail',
      risk_notes: `${tool} 검사를 실행하지 못했습니다. 검사되지 않은 구성은 통과시키지 않습니다.`,
    };
  }
}

/** Trivy JSON에서 사람에게 보여줄 문장만 뽑는다. */
function parseTrivy(stdout: string): string[] {
  const parsed = JSON.parse(stdout || '{}') as {
    Results?: { Misconfigurations?: { ID?: string; Title?: string; Resolution?: string }[] }[];
  };

  const out: string[] = [];
  for (const result of parsed.Results ?? []) {
    for (const m of result.Misconfigurations ?? []) {
      out.push(`[${m.ID ?? '?'}] ${m.Title ?? ''}${m.Resolution ? ` — ${m.Resolution}` : ''}`);
    }
  }
  return out;
}

/** Conftest JSON에서 위반과 경고를 나눠 뽑는다. 판정은 위반만 뒤집는다. */
function parseConftest(stdout: string): { failures: string[]; warnings: string[] } {
  const parsed = JSON.parse(stdout || '[]') as {
    failures?: { msg?: string }[];
    warnings?: { msg?: string }[];
  }[];

  const failures: string[] = [];
  const warnings: string[] = [];
  for (const file of parsed) {
    for (const f of file.failures ?? []) if (f.msg) failures.push(f.msg);
    for (const w of file.warnings ?? []) if (w.msg) warnings.push(w.msg);
  }
  return { failures, warnings };
}
