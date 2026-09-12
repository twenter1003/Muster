import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, QueryFailedError } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import type { Repository } from 'typeorm';
import {
  DeploymentEvent,
  GitIntegration,
  HealthSnapshot,
  LogEntry,
  WebhookDelivery,
} from '../../database/entities';
import { SECRET_STORE, type SecretStore } from '../../common/secrets/secret-store';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  DomainEvent,
  type HealthSnapshotCreatedEvent,
  type LogAppendedEvent,
} from '../../common/events/domain-events';
import { isValidSignature } from './github-signature';
import { interpret } from './github-events';
import { HealthService } from './health.service';

/** 유니크 위반. 멱등성 판정에 쓴다. */
const PG_UNIQUE_VIOLATION = '23505';

export interface WebhookRequest {
  eventType: string;
  deliveryId: string;
  signature: string | undefined;
  rawBody: Buffer;
}

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored';

@Injectable()
export class WebhookIngestService {
  private readonly logger = new Logger(WebhookIngestService.name);

  constructor(
    @InjectRepository(GitIntegration) private readonly integrations: Repository<GitIntegration>,
    @Inject(SECRET_STORE) private readonly secrets: SecretStore,
    private readonly health: HealthService,
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * 설계서 Part 4 §7.1 — GitHub 웹훅 수신.
   *
   * 순서에 주의: 서명을 검증하려면 프로젝트별 시크릿이 필요하고, 어느 프로젝트인지는
   * **페이로드를 봐야** 안다. 닭과 달걀처럼 보이지만, 페이로드에서 읽는 것은 레포 식별자
   * 하나뿐이고 그것으로는 조회만 한다. 쓰기는 서명이 통과한 뒤에야 일어난다.
   */
  async handle(req: WebhookRequest): Promise<WebhookOutcome> {
    const payload: unknown = this.parse(req.rawBody);
    const repoUrl = repoUrlOf(payload);

    const integration = repoUrl ? await this.findIntegration(repoUrl) : null;
    const secret = integration ? await this.secrets.get(integration.webhook_secret_ref) : null;

    if (!integration || !secret || !isValidSignature(req.rawBody, secret, req.signature)) {
      // 세 경우를 같은 응답으로 만든다. 구분해 알려주면 서명 없이도 "이 레포가 연동돼
      // 있는가"를 물어볼 수 있는 조회 창구가 된다. 무엇이 문제였는지는 서버 로그에만 남긴다.
      this.logger.warn(
        `웹훅 거부 (delivery ${req.deliveryId}): ${
          !integration ? '연동 없음' : !secret ? '시크릿 없음' : '서명 불일치'
        } repo=${repoUrl ?? '(알 수 없음)'}`,
      );
      throw new ApiException(
        ErrorCode.WEBHOOK_SIGNATURE_INVALID,
        '웹훅 서명을 검증할 수 없습니다.',
        401,
      );
    }

    return this.record(integration.project_id, req, payload);
  }

  /**
   * 배달 기록과 적재를 **한 트랜잭션**으로 묶는다.
   *
   * 배달 기록을 먼저 커밋하고 적재하다 실패하면, GitHub이 재전송해도 "이미 처리함"으로
   * 무시돼 이벤트가 영영 사라진다. 같은 트랜잭션에 두면 실패 시 배달 기록까지 함께 롤백되어
   * 재전송이 정상적으로 다시 처리된다.
   */
  private async record(
    projectId: string,
    req: WebhookRequest,
    payload: unknown,
  ): Promise<WebhookOutcome> {
    const { log, deployment } = interpret(req.eventType, payload);

    let appended: LogEntry | null = null;
    let snapshot: HealthSnapshot | null = null;

    try {
      await this.dataSource.transaction(async (manager) => {
        // delivery_id UNIQUE가 멱등성의 실제 집행 지점이다. 조회 후 삽입이 아니라 삽입을
        // 시도하고 위반을 잡는 이유는, 같은 배달이 동시에 둘 들어와도 안전하기 때문이다.
        await manager.insert(WebhookDelivery, {
          project_id: projectId,
          event_type: req.eventType,
          delivery_id: req.deliveryId,
        });

        if (deployment) {
          await manager.insert(DeploymentEvent, { project_id: projectId, ...deployment });
          // 설계서 Part 4 §7.1의 "필요 시 HEALTH_SNAPSHOTS 재계산 트리거". 같은 트랜잭션에서
          // 하므로 방금 넣은 이벤트가 반영되고, 이벤트만 남고 스냅샷이 빠지는 상태가 없다.
          snapshot = await this.health.recompute(manager, projectId);
        }

        if (log) {
          appended = await manager.save(
            manager.create(LogEntry, { project_id: projectId, agent_id: null, ...log }),
          );
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        this.logger.log(`중복 배달 무시 (delivery ${req.deliveryId})`);
        return 'duplicate';
      }
      throw error;
    }

    // 커밋 뒤에 발행한다. 롤백된 트랜잭션의 로그가 SSE로 나가면 화면에만 존재하는 줄이 생긴다.
    if (appended) this.emitLogAppended(appended);
    if (snapshot) this.emitHealthSnapshot(snapshot);

    return log || deployment ? 'processed' : 'ignored';
  }

  private emitHealthSnapshot(snapshot: HealthSnapshot): void {
    this.events.emit(DomainEvent.HEALTH_SNAPSHOT_CREATED, {
      project_id: snapshot.project_id,
      snapshot_id: snapshot.id,
      composite_score: Number(snapshot.composite_score),
      measured_at: snapshot.measured_at.toISOString(),
    } satisfies HealthSnapshotCreatedEvent);
  }

  private emitLogAppended(entry: LogEntry): void {
    this.events.emit(DomainEvent.LOG_APPENDED, {
      project_id: entry.project_id,
      log_entry_id: entry.id,
      level: entry.level,
      message: entry.message,
      created_at: entry.created_at.toISOString(),
    } satisfies LogAppendedEvent);
  }

  /** 레포 URL은 대소문자가 달라도 같은 레포다 (GitHub이 표기를 보존해서 보낸다). */
  private async findIntegration(repoUrl: string): Promise<GitIntegration | null> {
    return this.integrations
      .createQueryBuilder('gi')
      .where('LOWER(gi.repo_url) = LOWER(:repoUrl)', { repoUrl })
      .getOne();
  }

  private parse(rawBody: Buffer): unknown {
    try {
      return JSON.parse(rawBody.toString('utf8'));
    } catch {
      return null;
    }
  }
}

/**
 * 페이로드에서 레포 식별자만 뽑는다. **서명 검증 전에 읽는 유일한 값**이라 여기서 하는 일은
 * 조회 키 생성뿐이다. full_name을 쓰는 이유는 html_url보다 형태가 안정적이고,
 * GIT_INTEGRATIONS.repo_url이 `https://github.com/<owner>/<repo>`로 정규화돼 저장되기 때문이다.
 */
function repoUrlOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const repository = (payload as { repository?: unknown }).repository;
  if (typeof repository !== 'object' || repository === null) return null;

  const fullName = (repository as { full_name?: unknown }).full_name;
  if (typeof fullName !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(fullName)) return null;

  return `https://github.com/${fullName}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error as QueryFailedError & { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}
