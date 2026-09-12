import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { ApiException } from '../../common/errors/api.exception';
import { WebhookIngestService, type WebhookOutcome } from './webhook-ingest.service';

/**
 * 설계서 Part 4 §7.1 — `POST /webhooks/github`.
 *
 * 프론트엔드가 부르지 않는 내부용 엔드포인트다. 사용자 세션이 없으므로 @Public()으로
 * 전역 AuthGuard를 비켜가고, 대신 HMAC 서명이 인증을 대신한다 (Part 2 §6.3).
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly ingest: WebhookIngestService) {}

  @Public()
  @Post('github')
  @HttpCode(200)
  async github(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-github-event') eventType: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ): Promise<{ status: WebhookOutcome }> {
    // rawBody는 main.ts의 `rawBody: true`가 채운다. 없으면 설정이 빠진 것이므로,
    // 서명 검증을 건너뛰는 대신 명확히 실패한다.
    if (!req.rawBody) {
      throw ApiException.validationFailed('요청 본문을 읽을 수 없습니다.');
    }
    if (!eventType || !deliveryId) {
      throw ApiException.validationFailed('X-GitHub-Event와 X-GitHub-Delivery가 필요합니다.');
    }

    const status = await this.ingest.handle({
      eventType,
      deliveryId,
      signature,
      rawBody: req.rawBody,
    });

    return { status };
  }
}
