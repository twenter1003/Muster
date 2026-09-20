import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './lib/session';
import { AppShell } from './shell/AppShell';
import { NotReadyPage } from './routes/pages';
import { LoginPage } from './routes/LoginPage';
import { InvitePage } from './routes/InvitePage';
import { RequireSession } from './routes/RequireSession';
import { ImportReposPage } from './routes/ImportReposPage';
import { ProjectListPage } from './routes/ProjectListPage';
import { ProjectDetailPage } from './routes/ProjectDetailPage';

/**
 * 라우팅. 경량 재설계 이후 로그인 필요 구간은 셋뿐이다 — 프로젝트 목록(/)·
 * 레포 가져오기(/import)·프로젝트 상세(/projects/:id).
 *
 * 리포트·감사 로그·알림·DocStore·EnvCatalog·AgentRegistry·설정·대시보드·
 * 프로젝트 개요 화면은 **파일까지 삭제했다**. 한동안 "라우트만 빼고 파일은 남겨 둔다"로
 * 두었는데, 그 상태가 7,400줄을 도달 불가능한 채로 살려 두면서 매 세션 "이건 살아 있는
 * 코드인가"를 다시 판단하게 만들었다. 되살릴 일이 생기면 git 히스토리에서 꺼낸다 —
 * 지우지 않고 두는 것보다 그쪽이 싸다.
 *
 * react-router-dom을 들인 이유: /projects/:id가 파라미터를 쓴다. 직접 짜면 history API·
 * 뒤로가기·활성 링크 표시를 다시 만들게 되고, 그건 라우터를 잘못 만드는 일이다.
 * 데이터 라우터(createBrowserRouter)가 아니라 선언형 <Routes>를 쓰는 이유는, 로더·액션이
 * 필요해지기 전까지는 추가 개념이 비용일 뿐이기 때문이다.
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

          {/*
            초대 수락은 셸 밖이면서 RequireSession 밖이기도 하다. 로그인하지 않은 사람에게
            건네는 링크라, 안쪽에 두면 /login으로 튕기면서 주소창의 토큰이 사라진다.
          */}
          <Route path="/invite/:token" element={<InvitePage />} />

          {/* 로그인이 필요한 전 구간. 실제 차단은 서버 가드가 하고 여기는 흐름만 잡는다. */}
          <Route element={<RequireSession />}>
            <Route element={<AppShell />}>
              <Route index element={<ProjectListPage />} />
              <Route path="/projects" element={<ProjectListPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/import" element={<ImportReposPage />} />
              {/* 아직 없는 경로. 막다른 404 대신 자리표시자로 받는다. */}
              <Route path="*" element={<NotReadyPage />} />
            </Route>
          </Route>
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
