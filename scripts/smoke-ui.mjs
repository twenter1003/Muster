/**
 * 화면 훑기 — 실제 브라우저로 앱을 눌러 본다.
 *
 * 왜 필요한가: 타입·린트·단위 테스트는 "코드가 컴파일된다"까지만 말한다. 실제로 막힌 것들은
 * 그 아래에 있었다 — 에이전트 등록 UI가 아예 없었고, 환경 구성 만들기 화면에 들어가는
 * 링크가 없었다. 둘 다 화면을 한 번만 열어 봤으면 나왔을 것들이고, 배포한 뒤에야 발견됐다.
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
  ['/', 'dashboard'],
  ['/projects', 'projects'],
  ['/inbox', 'inbox'],
  ['/docstore', 'docstore'],
  ['/envcatalog', 'envcatalog'],
  ['/agentregistry', 'agentregistry'],
  ['/logs', 'logs'],
  ['/reports', 'reports'],
  ['/audit', 'audit'],
  ['/settings/budget', 'settings-budget'],
  ['/settings/api-keys', 'settings-api-keys'],
  ['/settings/git', 'settings-git'],
  ['/settings/members', 'settings-members'],
];
for (const [path, name] of SCREENS) {
  await step(name, async () => {
    await open(path);
    await shot(name);
  });
}

console.log('\n만들고 눌러 본다');
const NAME = `smoke ${Date.now()}`;
let projectUrl = '';

await step('프로젝트 생성 → 목록 반영', async () => {
  await open('/projects');
  await page.getByRole('button', { name: /프로젝트 생성/ }).click();
  const dialog = page.locator('dialog');
  await dialog.locator('input').first().fill(NAME);
  await dialog.getByRole('button', { name: '만들기' }).click();
  await page.getByText(NAME).first().waitFor();
});

await step('프로젝트 열기', async () => {
  await page.getByText(NAME).first().click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  projectUrl = page.url().split('?')[0];
});

await step('에이전트 등록 → 목록 반영', async () => {
  await open(new URL(projectUrl).pathname + '?tab=agents');
  await page.getByRole('button', { name: '에이전트 등록' }).click();
  await page.locator('#new-agent-name').fill('smoke 에이전트');
  await page.locator('dialog').getByRole('button', { name: '등록' }).click();
  await page.getByText('smoke 에이전트').first().waitFor();
  await shot('agents');
});

await step('환경 탭에 시작점 두 개가 있다', async () => {
  await open(new URL(projectUrl).pathname + '?tab=env');
  await page.getByRole('button', { name: '새 환경 구성' }).waitFor();
  await page.getByRole('button', { name: '워크플로 설치' }).waitFor();
  await shot('env');
});

await step('「새 환경 구성」이 만들기 화면을 연다', async () => {
  await page.getByRole('button', { name: '새 환경 구성' }).click();
  await page.waitForURL(/\/env\/new/);
  await shot('env-new');
});

await step('문서 탭에 업로드 자리가 있다', async () => {
  await open(new URL(projectUrl).pathname + '?tab=docs');
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
  await shot('docs');
});

await step('나머지 탭이 열린다', async () => {
  for (const t of ['overview', 'logs', 'stages', 'audit']) {
    await open(new URL(projectUrl).pathname + `?tab=${t}`);
  }
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
