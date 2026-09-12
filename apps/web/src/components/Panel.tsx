import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  /** 머리 오른쪽에 붙는 보조 — 건수·상태 배지·필터 칩처럼 제목에 딸린 것만 넣는다. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * 제목 줄과 본문을 선으로 가른 상자. 개요·환경 구성 화면이 각자 똑같은 것을 들고 있던 것을 모았다.
 *
 * 왜 카드(.card)와 따로 두는가: 카드는 여백을 상자가 갖고 배경이 표면색이며, 패널은 여백이
 * 머리·본문 구획에 붙고 배경이 바탕색이다. 한 컴포넌트에 variant로 묶으면 두 모양을 고를 수
 * 있게 되는데, 그러면 "어느 화면이 어느 모양인가"가 호출자의 취향 문제가 된다.
 */
export function Panel({ title, aside, children }: PanelProps) {
  return (
    <section className="panel">
      <h2 className="panel__head">
        {title}
        {aside !== undefined && <span className="panel__aside">{aside}</span>}
      </h2>
      <div className="panel__body">{children}</div>
    </section>
  );
}
