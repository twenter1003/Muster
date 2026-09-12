import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './lib/session';
import { AppShell } from './shell/AppShell';
import { NotReadyPage } from './routes/pages';
import { InboxPage } from './routes/InboxPage';
import { LoginPage } from './routes/LoginPage';
import { RequireSession } from './routes/RequireSession';
import { DashboardPage } from './routes/DashboardPage';
import { ProjectListPage } from './routes/ProjectListPage';
import { ProjectOverviewPage } from './routes/ProjectOverviewPage';
import { EnvConfigCreatePage } from './routes/EnvConfigCreatePage';
import { ReportsPage } from './routes/ReportsPage';
import { SettingsPage } from './routes/SettingsPage';

/**
 * 라우팅(설계서 02). 8개 경로가 전부 여기 한 곳에 있다.
 *
 * react-router-dom을 들인 이유: 경로 8개 중 둘이 파라미터(:id)를 쓰고 설정은 /settings/* 하위
 * 경로를 갖는다. 직접 짜면 history API·뒤로가기·활성 링크 표시·중첩 레이아웃을 다시 만들게 되고,
 * 그건 라우터를 잘못 만드는 일이다. 대안(경로 상태를 useState로 들고 렌더 분기)은 주소창과
 * 상태가 어긋나 새로고침·링크 공유가 깨진다.
 * 버전은 기억이 아니라 레지스트리로 확인했다 — `npm view react-router-dom version` → 7.18.3
 * (peer: react >= 18, 이 앱은 React 18.3). 데이터 라우터(createBrowserRouter)가 아니라 선언형
 * <Routes>를 쓰는 이유는, 로더·액션이 필요해지기 전까지는 추가 개념이 비용일 뿐이기 때문이다.
 *
 * SessionProvider가 라우터 안쪽인 이유: 로그인 화면도 세션을 알아야 하고(이미 로그인했으면
 * 되돌려보낸다), 세션 조회는 앱 전체에서 한 번이면 된다.
 */
export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          {/* 로그인만 셸 밖이다. 인증 전에는 사이드바에 채울 것이 없다. */}
          <Route path="/login" element={<LoginPage />} />

          {/* 로그인이 필요한 전 구간. 실제 차단은 서버 가드가 하고 여기는 흐름만 잡는다. */}
          <Route element={<RequireSession />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectListPage />} />
              <Route path="/projects/:id" element={<ProjectOverviewPage />} />
              <Route path="/projects/:id/env/new" element={<EnvConfigCreatePage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              {/* 설정은 탭(예산·API 키·연동)이 하위 경로로 붙을 자리라 처음부터 /* 로 연다. */}
              <Route path="/settings/*" element={<SettingsPage />} />
              {/* 사이드바의 모듈 항목 등 아직 없는 경로. 막다른 404 대신 자리표시자로 받는다. */}
              <Route path="*" element={<NotReadyPage />} />
            </Route>
          </Route>
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
