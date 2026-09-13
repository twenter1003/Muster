import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodeValue } from './error-codes';

/** 통합설계서 Part 4 §1의 에러 본문 형태. */
export interface ApiErrorBody {
  error: { code: ErrorCodeValue; message: string };
}

/**
 * 모든 도메인 예외의 기반 클래스. HTTP 상태 코드와 에러 코드를 함께 들고 다닌다.
 * 이 클래스를 쓰면 필터를 거치지 않아도 본문 형태가 보장된다.
 */
export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCodeValue,
    message: string,
    status: HttpStatus,
  ) {
    super({ error: { code, message } } satisfies ApiErrorBody, status);
  }

  static unauthenticated(message = '인증이 필요합니다.') {
    return new ApiException(ErrorCode.UNAUTHENTICATED, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message = '권한이 없습니다.') {
    return new ApiException(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  static notFound(message = '리소스를 찾을 수 없습니다.') {
    return new ApiException(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static validationFailed(message: string) {
    return new ApiException(ErrorCode.VALIDATION_FAILED, message, HttpStatus.BAD_REQUEST);
  }

  /** GitHub 토큰이 죽었고 갱신도 실패했다 — 사용자가 다시 인증하는 것 외에 방법이 없다. */
  static githubReauthRequired(message = 'GitHub 재인증이 필요합니다.') {
    return new ApiException(ErrorCode.GITHUB_REAUTH_REQUIRED, message, HttpStatus.FORBIDDEN);
  }

  /**
   * 시크릿 저장소에 접근할 수 없다 — 배포 설정 문제다.
   *
   * 503인 이유: 요청은 옳았고 서버 쪽 의존성이 답하지 않는 것이라, 사용자가 요청을
   * 고쳐서 될 일이 아니다(4xx가 아니다). 운영자가 권한을 열면 재배포 없이 낫는다.
   */
  static secretStoreUnavailable(message: string) {
    return new ApiException(
      ErrorCode.SECRET_STORE_UNAVAILABLE,
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  static conflict(code: ErrorCodeValue, message: string) {
    return new ApiException(code, message, HttpStatus.CONFLICT);
  }
}
