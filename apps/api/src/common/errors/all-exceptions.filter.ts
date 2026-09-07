import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode, ErrorCodeValue } from './error-codes';
import type { ApiErrorBody } from './api.exception';

/**
 * 어떤 예외가 나가든 응답 본문을 `{ error: { code, message } }`로 통일한다 (통합설계서 Part 4 §1).
 * ApiException이 아닌 Nest 기본 예외(ValidationPipe 등)도 여기서 번역된다.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = this.toBody(exception, status);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status} ${body.error.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(body);
  }

  private toBody(exception: unknown, status: number): ApiErrorBody {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      // ApiException이 이미 규약대로 만들어 둔 본문은 그대로 통과시킨다.
      if (this.isApiErrorBody(payload)) {
        return payload;
      }

      const message =
        typeof payload === 'string'
          ? payload
          : (this.flattenMessage((payload as { message?: unknown }).message) ?? exception.message);

      return { error: { code: this.codeForStatus(status), message } };
    }

    // 내부 오류의 원인 문자열은 클라이언트에 노출하지 않는다 (로그에만 남긴다).
    return { error: { code: ErrorCode.INTERNAL, message: '서버 내부 오류가 발생했습니다.' } };
  }

  private isApiErrorBody(payload: unknown): payload is ApiErrorBody {
    if (typeof payload !== 'object' || payload === null) return false;
    const error = (payload as { error?: unknown }).error;
    if (typeof error !== 'object' || error === null) return false;
    return (
      typeof (error as { code?: unknown }).code === 'string' &&
      typeof (error as { message?: unknown }).message === 'string'
    );
  }

  private flattenMessage(message: unknown): string | undefined {
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');
    return undefined;
  }

  private codeForStatus(status: number): ErrorCodeValue {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      default:
        return ErrorCode.INTERNAL;
    }
  }
}
