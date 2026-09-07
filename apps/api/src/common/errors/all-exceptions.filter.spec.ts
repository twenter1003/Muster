import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiException } from './api.exception';

function hostWith() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/api/v1/x' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeAll(() => {
    // 5xx 경로에서 스택을 찍는 로거를 조용히 시킨다.
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('ApiException의 본문을 그대로 유지한다', () => {
    const { host, status, json } = hostWith();
    filter.catch(ApiException.notFound('프로젝트 없음'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: '프로젝트 없음' },
    });
  });

  it('Nest 기본 예외도 { error: { code, message } }로 번역한다', () => {
    const { host, status, json } = hostWith();
    filter.catch(new NotFoundException('nope'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({ error: { code: 'NOT_FOUND', message: 'nope' } });
  });

  it('ValidationPipe의 message 배열을 한 문장으로 합친다', () => {
    const { host, json } = hostWith();
    filter.catch(new BadRequestException(['a는 필수', 'b는 정수']), host);

    expect(json).toHaveBeenCalledWith({
      error: { code: 'VALIDATION_FAILED', message: 'a는 필수, b는 정수' },
    });
  });

  it('알 수 없는 예외는 500 INTERNAL로 만들고 원인을 노출하지 않는다', () => {
    const { host, status, json } = hostWith();
    filter.catch(new Error('DB password is hunter2'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: '서버 내부 오류가 발생했습니다.' },
    });
  });
});
