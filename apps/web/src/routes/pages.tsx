import { useParams } from 'react-router-dom';

/**
 * 라우트 껍데기. 화면 제목만 렌더한다.
 *
 * 왜 내용을 안 채우는가: 화면 시안(Muster Console.dc.html)을 아직 받지 못했다.
 * 지금 레이아웃을 지어내면 시안이 오는 순간 버려질 코드가 되고, 그 사이에 다른 화면이
 * 그 임시 레이아웃을 흉내 내며 번진다. 껍데기는 라우팅·셸·경로 표기만 검증한다.
 */
function Page({ title, note }: { title: string; note?: string }) {
  return (
    <section>
      <h1 className="page__title">{title}</h1>
      <p className="page__note">{note ?? '시안 수령 후 채운다.'}</p>
    </section>
  );
}

export const DashboardPage = () => <Page title="전체 현황" />;
export const ProjectListPage = () => <Page title="프로젝트" />;
export const InboxPage = () => <Page title="알림" />;
export const ReportsPage = () => <Page title="리포트" />;
export const SettingsPage = () => <Page title="설정" />;

export function ProjectOverviewPage() {
  // :id를 실제로 읽어 라우트 파라미터가 셸까지 도달하는지 껍데기 단계에서 확인한다.
  const { id } = useParams<{ id: string }>();
  return <Page title={`프로젝트 ${id ?? ''}`} />;
}

export function EnvConfigCreatePage() {
  const { id } = useParams<{ id: string }>();
  return <Page title={`환경 구성 생성 · ${id ?? ''}`} />;
}

/** 사이드바의 모듈 항목처럼 아직 라우트가 없는 링크가 막다른 길이 되지 않게 받는다. */
export const NotReadyPage = () => (
  <Page title="준비 중" note="아직 만들지 않은 화면이다. 해당 Phase에서 붙인다." />
);

/** 로그인은 셸 밖에 있다 — 사이드바·검색이 쓸모없고, 인증 전에는 배지에 넣을 데이터도 없다. */
export const LoginPage = () => (
  <main style={{ padding: 'var(--space-8)' }}>
    <h1 className="page__title">Muster</h1>
    <p className="page__note">GitHub 계정 하나로 로그인한다. (Phase 3)</p>
  </main>
);
