import { compareDecimals, sumDecimals } from './decimal';

describe('sumDecimals', () => {
  it('부동소수점이 틀리는 덧셈을 정확히 한다', () => {
    // Number로 하면 0.30000000000000004이 나오는 고전적인 경우.
    expect(sumDecimals(['0.1000', '0.2000'])).toBe('0.3000');
  });

  it('센트 미만 자리가 누적돼도 어긋나지 않는다', () => {
    // 0.0001을 1000번 더하면 정확히 0.1이어야 한다.
    expect(sumDecimals(Array(1000).fill('0.0001'))).toBe('0.1000');
  });

  it('numeric(12,4) 최대 자리수를 넘겨도 정수로 정확히 더한다', () => {
    expect(sumDecimals(['99999999.9999', '0.0001'])).toBe('100000000.0000');
  });

  it('빈 배열은 0', () => {
    expect(sumDecimals([])).toBe('0.0000');
  });

  it('null(집계 대상 0건인 SUM)은 0으로 본다', () => {
    expect(sumDecimals([null, '1.5000', undefined])).toBe('1.5000');
  });

  it('소수점 없는 정수 문자열도 받는다', () => {
    expect(sumDecimals(['3', '0.2500'])).toBe('3.2500');
  });

  it('음수를 처리한다', () => {
    expect(sumDecimals(['-1.2500', '0.2500'])).toBe('-1.0000');
  });

  it('숫자가 아니면 조용히 0을 내지 않고 던진다', () => {
    expect(() => sumDecimals(['abc'])).toThrow();
  });
});

describe('compareDecimals', () => {
  it('문자열 비교로는 틀리는 순서를 바로잡는다', () => {
    // 문자열로 비교하면 '9.0000' > '10.0000'이다.
    expect(compareDecimals('9.0000', '10.0000')).toBe(-1);
  });

  it('같은 값은 0', () => {
    expect(compareDecimals('1.5000', '1.50')).toBe(0);
  });
});
