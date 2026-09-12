import { API_BASE } from '../lib/api';

/**
 * 로그인 (목업 1i · 설계서 08).
 *
 * 이메일/비밀번호를 두지 않는다 — GitHub 연동이 제품의 전제라, 로그인만 통과하고 레포 권한이
 * 없는 사용자는 어차피 아무것도 할 수 없다.
 *
 * 버튼이 <button onClick>이 아니라 <a href>인 이유: OAuth 시작은 top-level 네비게이션이어야
 * 한다. fetch로 부르면 GitHub의 로그인 화면이 응답 본문으로 돌아올 뿐 사용자는 아무것도 못 본다.
 * 세션 쿠키가 SameSite=Lax인 것도 이 경로가 top-level 이동이라 성립한다.
 */
export function LoginPage() {
  return (
    <main className="login">
      <div className="login__panel">
        <h1 className="login__brand">Muster</h1>

        <h2 className="login__lead">여러 프로젝트를 한 화면에서</h2>
        <p className="login__body">
          문서·개발환경·에이전트·진행 상황을 프로젝트별로 모아 봅니다. 로그인은 GitHub 계정 하나로
          처리되고, 같은 인증으로 레포 연동 권한까지 함께 받습니다.
        </p>

        {/* 이 화면의 유일한 솔리드 버튼이다 (설계서 10 · 화면당 1개). */}
        <a className="btn btn--solid login__cta" href={`${API_BASE}/auth/github/login`}>
          GitHub으로 계속하기
        </a>

        <p className="login__meta">요청 스코프: read:user · repo (웹훅 등록 포함)</p>
        <p className="login__meta">세션은 서버에 저장되어 로그아웃 시 즉시 무효화됩니다.</p>

        <h3 className="login__section">연결되는 것</h3>
        <ul className="login__links">
          <li>레포 커밋·PR 웹훅</li>
          <li>배포·워크플로 이벤트</li>
          <li>문서 저장소(GCS)</li>
          <li>에이전트 실행 이력</li>
        </ul>
      </div>
    </main>
  );
}
