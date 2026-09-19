import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AGENT_RUN_STATUSES, type AgentRunStatus } from './enums';
import { Agent } from './agent.entity';

/**
 * 에이전트 실행 이력. 토큰/비용 집계의 원천이며 프로젝트 예산 사용률도 여기서 나온다.
 *
 * cost를 numeric으로 두는 이유: 부동소수점으로 금액을 누적하면 반올림 오차가 쌓여
 * 예산 임계치 판정이 어긋난다. TypeORM은 numeric을 문자열로 돌려주므로 타입도 string이며,
 * 합계는 JS가 아니라 SQL의 SUM()으로 계산해 정밀도를 유지한다.
 */
@Entity('agent_runs')
@Index('idx_agent_runs_agent_started', ['agent_id', 'started_at'])
export class AgentRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  agent_id!: string;

  @Column({ type: 'varchar', length: 20, default: AGENT_RUN_STATUSES[0] })
  status!: AgentRunStatus;

  /** 네 종류를 합한 총량. 화면의 "토큰" 숫자는 계속 이 값을 쓴다. */
  @Column({ type: 'integer', default: 0 })
  tokens_used!: number;

  /*
   * 토큰 내역 4종 (LLM_ECOSYSTEM_GUIDE 2장·5장).
   *
   * 합계만 두면 비용을 정확히 낼 수 없다 — 캐시 읽기는 정규 입력가의 10% 안팎이고 캐시 쓰기는
   * 오히려 25% 비싸서, 합쳐 놓고 정규가로 곱하면 캐싱을 잘 쓸수록 비용이 부풀려진다.
   * 실제 세션을 재어 보니 입력의 98.6%가 캐시 읽기였고 총액이 7.6배로 과다 계상됐다.
   *
   * 예전 실행 기록에는 내역이 없으므로 nullable이다. null은 "모름"이지 0이 아니다.
   */
  @Column({ type: 'integer', nullable: true })
  input_tokens?: number | null;

  @Column({ type: 'integer', nullable: true })
  output_tokens?: number | null;

  @Column({ type: 'integer', nullable: true })
  cache_read_tokens?: number | null;

  @Column({ type: 'integer', nullable: true })
  cache_write_tokens?: number | null;

  /** USD. 소수 4자리까지 (백만 토큰당 단가 계산에서 센트 미만이 나온다). */
  @Column({ type: 'numeric', precision: 12, scale: 4, default: 0 })
  cost!: string;

  /** 사용된 실제 LLM 모델명 (예: claude-3-5-sonnet, gemini-2.5-flash 등). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  model?: string | null;

  @Column({ type: 'timestamptz' })
  started_at!: Date;

  /** 실행 중(running)이면 null. */
  @Column({ type: 'timestamptz', nullable: true })
  ended_at!: Date | null;

  @ManyToOne(() => Agent, (agent) => agent.runs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent!: Agent;
}
