import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * 솔리드는 "지금 이 화면에서 할 일"을 단수로 지정하는 장치다.
   * 규칙: 화면당 솔리드 버튼 1개, 나머지는 전부 아웃라인.
   * 버튼들이 서로를 알 수 없어 타입으로 강제할 수 없으므로 규칙을 여기에 남긴다 —
   * 화면 리뷰 때 solid가 두 번 나오면 반려한다.
   */
  variant?: 'solid' | 'outline';
}

export function Button({ variant = 'outline', className, ...rest }: ButtonProps) {
  const cls = variant === 'solid' ? 'btn btn--solid' : 'btn';
  return <button type="button" className={className ? `${cls} ${className}` : cls} {...rest} />;
}
