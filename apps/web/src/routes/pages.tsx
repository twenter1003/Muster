/**
 * 아직 내용을 채우지 않은 화면들의 공용 껍데기.
 *
 * 화면 하나가 실제로 구현될 때 자기 파일(예: routes/ProjectListPage.tsx)로 옮겨 간다.
 * 파일을 화면 단위로 가르는 이유는 여러 사람(또는 에이전트)이 동시에 화면을 채울 때
 * 한 파일에 몰리면 매번 충돌하기 때문이다.
 */
export function Page({ title, note }: { title: string; note?: string }) {
  return (
    <section>
      <h1 className="page__title">{title}</h1>
      <p className="page__note">{note ?? '아직 구현하지 않았다.'}</p>
    </section>
  );
}

/**
 * 인박스. 백엔드가 없어서 비워 둔다 — 설계서 Part 4 §8(GET /audit-logs)이 미구현이고
 * AUDIT_LOGS는 엔티티만 있고 쓰는 곳도 읽는 곳도 없다. 화면만 먼저 만들면 빈 목록을
 * "알림이 없다"로 보여 주게 되는데, 그건 사실이 아니라 거짓말이다.
 */
export const InboxPage = () => (
  <Page title="알림" note="감사 로그 API(Part 4 §8)가 아직 없어 비워 둔다." />
);

/** 사이드바의 모듈 항목처럼 아직 라우트가 없는 링크가 막다른 길이 되지 않게 받는다. */
export const NotReadyPage = () => (
  <Page title="준비 중" note="아직 만들지 않은 화면이다." />
);
