import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 처리한 GitHub 웹훅 배달 ID. 설계서 16개 엔티티에는 없으나
 * Part 4 §7.1의 "X-GitHub-Delivery 기준 중복 무시" 계약을 지키려면 반드시 필요하다 (17번째).
 *
 * delivery_id UNIQUE가 멱등성의 실제 집행 지점이다 — 동시에 같은 배달이 두 번 들어와도
 * 두 번째 INSERT가 유니크 위반으로 떨어지므로 애플리케이션 레벨 락이 필요 없다.
 *
 * 웹훅 원본 페이로드는 저장하지 않는다 (Part 1 §8에서 명시적으로 범위 제외).
 * received_at 인덱스는 오래된 행을 주기적으로 정리하는 배치를 위한 것이다.
 */
@Entity('webhook_deliveries')
@Index('idx_webhook_deliveries_received', ['received_at'])
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** GitHub의 X-GitHub-Delivery 헤더 값 (UUID 형식이지만 문자열로 그대로 보관). */
  @Column({ type: 'varchar', length: 100, unique: true })
  delivery_id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  received_at!: Date;
}
