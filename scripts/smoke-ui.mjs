/**
 * 화면 훑기 — 실제 브라우저로 앱을 눌러 본다.
 *
 * 왜 필요한가: 타입·린트·단위 테스트는 "코드가 컴파일된다"까지만 말한다. 실제로 막힌 것들은
 * 그 아래에 있었다 — 버튼은 있는데 누르면 401이 나는 식이다. 화면을 한 번만 열어 봤으면
 * 나왔을 것들이고, 배포한 뒤에야 발견됐다.
 *
 * 훑는 대상은 **도달 가능한 화면 5개**다(docs/ARCHITECTURE.md의 화면 표가 원천):
 * `/login` · `/invite/:token` · `/`(=`/projects`) · `/projects/:id` · `/import`,
 * 그리고 라우트 없는 경로가 NotReadyPage로 떨어지는지.
 *
 * 2026-09-20 이전에는 이 파일이 화면 13개를 훑었는데 그중 11개는 PR #76에서 삭제된
 * 화면이었다. 지워진 경로도 SPA가 200을 주고 NotReadyPage를 그리므로 **스모크는 계속
 * 통과했다** — 통과하는 척만 하고 있었다. 화면을 지우거나 더하면 아래 SCREENS를 같이 고칠 것.
 *
 * 무엇을 잡는가: 화면이 뜨는가, 버튼이 있는가, 눌러서 서버까지 갔다가 화면에 반영되는가,
 * 콘솔 오류나 4xx/5xx가 나는가.
 * 무엇을 못 잡는가: 진짜 GitHub·GCP가 있어야 드러나는 것(OAuth 스코프, IAM, GitHub이
 * 204 대신 200을 주는 것). 그것들은 여기서 확인할 수 없다 — 알고 쓸 것.
 *
 * 쓰는 법 (README와 같다):
 *   1) Postgres를 띄우고 migration:run
 *   2) apps/api를 8080, apps/web을 5173에 띄운다
 *   3) node scripts/smoke-ui.mjs <세션토큰>
 *      세션 토큰은 scripts/dev-session.ts가 발급한다.
 */
import { chromium } from 'playwright';

const TOKEN = process.argv[2];
const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:5173';
const SHOTS = process.env.SMOKE_SHOTS ?? '/tmp/muster-smoke';

if (!TOKEN) {
  console.error('세션 토큰이 필요하다: node scripts/smoke-ui.mjs <token>');
  process.exit(2);
}

const failures = [];
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`  OK   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${String(e).split('\n')[0].slice(0, 160)}`);
    failures.push(name);
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
ctx.setDefaultTimeout(15_000);
await ctx.addCookies([
  { name: 'muster_session', value: TOKEN, domain: new URL(BASE).hostname, path: '/' },
]);
const page = await ctx.newPage();

/** 화면에는 안 보이는 실패를 모은다. 콘솔 오류와 4xx/5xx는 사용자가 볼 수 없다. */
const noise = [];
page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && noise.push(`console: ${m.text()}`));
page.on('response', (r) => {
  if (r.status() >= 400) {
    noise.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  }
});

/**
 * networkidle을 쓰지 않는다. 프로젝트 화면은 SSE 연결을 열어 둬서 네트워크가 영영
 * 조용해지지 않는다 — 기다리면 무조건 타임아웃이다.
 */
const open = async (path) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
};

const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

console.log('\n화면이 뜨는가');
const SCREENS = [
  ['/', 'projects'],
  ['/projects', 'projects-alias'],
  ['/import', 'import'],
];
for (const [path, name] of SCREENS) {
  await step(name, async () => {
    await open(path);
    await shot(name);
  });
}

console.log('\n눌러 본다');
let projectUrl = '';

await step('프로젝트 목록 → 상세로 들어간다', async () => {
  await open('/projects');
  // 카드 전체가 링크다. 이름 텍스트가 아니라 링크로 집는다 — 이름은 레포명과 겹칠 수 있다.
  await page.locator('a[href^="/projects/"]').first().click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  projectUrl = new URL(page.url()).pathname;
  await shot('project-detail');
});

await step('상세 화면에 토큰 차트와 목표가 그려진다', async () => {
  await page.getByTestId('token-stock-chart').waitFor();
  await page.getByRole('button', { name: /목표 직접 편집/ }).waitFor();
});

await step('API 키 모달이 열린다', async () => {
  await page.getByRole('button', { name: /API 키 관리/ }).first().click();
  // `dialog[open]`으로 집는다 — 닫힌 <dialog>도 DOM에 남아 있어 그냥 'dialog'는 물린다.
  await page.locator('dialog[open]').waitFor();
  await shot('api-keys-modal');
  await page.keyboard.press('Escape');
});

await step('목표 체크리스트 서랍이 열린다', async () => {
  await open(projectUrl);
  await page.getByRole('button', { name: /전체 체크리스트/ }).first().click();
  await page.locator('dialog[open][aria-label="목표 체크리스트 전체보기"]').waitFor();
  await shot('goal-checklist');
  await page.keyboard.press('Escape');
});

await step('상단 검색이 드롭다운에 결과를 그린다', async () => {
  await open('/projects');
  // 목록 화면에도 검색 입력이 하나 더 있다(프로젝트 이름 필터). 상단바 쪽을 정확히 집는다.
  await page.locator('.topbar__search').fill('muster');
  // 결과가 아니라 **옵션이 생기는 것**을 기다린다. 서버가 `query`를 되돌려주지 않으면
  // 화면이 응답을 버리고 "찾는 중…"에 멈추는데, 그건 여기서만 드러난다.
  await page.locator('[role=option]').first().waitFor();
  await shot('search');
});

await step('레포 가져오기 화면에 목록과 버튼이 있다', async () => {
  await open('/import');
  await page.locator('input[type=checkbox]').first().waitFor();
  await page.getByRole('button', { name: '가져오기' }).waitFor();
});

await step('라우트 없는 경로는 NotReadyPage로 떨어진다', async () => {
  await open('/no-such-screen');
  await page.getByText('준비 중').waitFor();
});

await browser.close();

const unique = [...new Set(noise)];
console.log('\n콘솔·네트워크 오류:', unique.length ? `\n  ${unique.join('\n  ')}` : '없음');
console.log(`스크린샷: ${SHOTS}`);

if (failures.length || unique.length) {
  console.log(`\n실패 ${failures.length}건, 오류 ${unique.length}건`);
  process.exit(1);
}
console.log('\n전부 통과');
