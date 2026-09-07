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

  @Column({ type: 'integer', default: 0 })
  tokens_used!: number;

  /** USD. 소수 4자리까지 (백만 토큰당 단가 계산에서 센트 미만이 나온다). */
  @Column({ type: 'numeric', precision: 12, scale: 4, default: 0 })
  cost!: string;

  @Column({ type: 'timestamptz' })
  started_at!: Date;

  /** 실행 중(running)이면 null. */
  @Column({ type: 'timestamptz', nullable: true })
  ended_at!: Date | null;

  @ManyToOne(() => Agent, (agent) => agent.runs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent!: Agent;
}
