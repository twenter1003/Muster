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
 * **왜 Playwright가 아니라 Stagehand인가.** 이 스크립트는 오래도록 `playwright`를 import
 * 했는데 그 패키지가 어느 package.json에도 없었다 — 깨끗한 체크아웃에서는
 * `ERR_MODULE_NOT_FOUND`로 죽었고, 그래서 **한 번도 실제로 돌아간 적이 없다.**
 * Stagehand는 루트 의존성으로 들어가 있고 브라우저 바이너리를 따로 받지 않는다.
 * 여기서는 AI 기능(act·observe·extract)을 **쓰지 않는다** — `goto`·`locator`·`click`처럼
 * 결정적인 것만 쓴다. 그래서 LLM 키도 Browserbase 키도 필요 없다.
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
 *
 * 목 서버로 화면만 훑어볼 수도 있다(토큰 불필요):
 *   pnpm --filter @muster/web build && node scripts/mock-server.mjs
 *   SMOKE_BASE=http://127.0.0.1:4173 node scripts/smoke-ui.mjs mock
 */
import { mkdirSync } from 'node:fs';
import { localBrowser, Stagehand } from '@browserbasehq/stagehand';

const TOKEN = process.argv[2];
const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:5173';
const SHOTS = process.env.SMOKE_SHOTS ?? '/tmp/muster-smoke';

if (!TOKEN) {
  console.error('세션 토큰이 필요하다: node scripts/smoke-ui.mjs <token>');
  console.error('목 서버로 훑어볼 때는 아무 값이나 준다: … smoke-ui.mjs mock');
  process.exit(2);
}

mkdirSync(SHOTS, { recursive: true });

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

const browser = await localBrowser.launch({
  headless: true,
  viewport: { width: 1440, height: 1000 },
});
const stagehand = await Stagehand.create({ browser });
const [page] = await browser.context.pages();

await browser.context.addCookies([
  { name: 'muster_session', value: TOKEN, domain: new URL(BASE).hostname, path: '/' },
]);

/**
 * 화면에는 안 보이는 실패를 모은다. 콘솔 오류와 4xx/5xx는 사용자가 볼 수 없다.
 *
 * Stagehand의 `page.on`은 `console` 하나만 받는다(`response`·`pageerror`는 거부한다).
 * 그래서 네트워크는 페이지 안에서 `fetch`와 `EventSource`를 감싸 직접 모은다 — 이 앱의
 * 서버 호출은 전부 `lib/api.ts`의 fetch와 `useSse`의 EventSource를 지나므로 이 둘이면 덮인다.
 */
const noise = [];

await page.on('console', (ev) => {
  const p = ev?.params;
  if (p?.type !== 'error') return;
  const text = (p.args ?? [])
    .map((a) => a?.value ?? a?.description ?? '')
    .join(' ')
    .trim();
  if (text) noise.push(`console: ${text.slice(0, 200)}`);
});

await page.addInitScript({
  content: `
    window.__smokeNoise = [];
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await origFetch(...args);
      if (res.status >= 400) {
        const u = new URL(res.url, location.origin);
        window.__smokeNoise.push('HTTP ' + res.status + ' ' + u.pathname);
      }
      return res;
    };
    const OrigES = window.EventSource;
    if (OrigES) {
      window.EventSource = function (url, cfg) {
        const es = new OrigES(url, cfg);
        es.addEventListener('error', () => {
          if (es.readyState === 2) window.__smokeNoise.push('SSE closed ' + url);
        });
        return es;
      };
      window.EventSource.prototype = OrigES.prototype;
    }
  `,
});

/** 페이지가 쌓아 둔 네트워크 잡음을 걷어 온다. 이동할 때마다 초기화되므로 그때그때 비운다. */
const drainNoise = async () => {
  const found = await page.evaluate('(window.__smokeNoise || []).splice(0)');
  if (Array.isArray(found)) noise.push(...found);
};

/**
 * networkidle을 쓰지 않는다. 프로젝트 화면은 SSE 연결을 열어 둬서 네트워크가 영영
 * 조용해지지 않는다 — 기다리면 무조건 타임아웃이다.
 */
const open = async (path) => {
  await drainNoise();
  await page.goto(BASE + path);
  await page.waitForTimeout(900);
};

const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

/** 텍스트로 버튼을 집는다. Stagehand의 locator는 `:has-text()`를 모르고 xpath는 안다. */
const btn = (text) => page.locator(`xpath=//button[contains(., "${text}")]`);

/**
 * `waitForURL`이 없다. 주소가 바뀔 때까지 짧게 돈다.
 *
 * `page.url()`은 **Promise를 준다** — Playwright처럼 동기라고 믿고 쓰면 정규식이
 * "[object Promise]"를 검사하게 되고, 그건 영영 맞지 않는다.
 */
const waitForUrl = async (re, ms = 8000) => {
  const until = Date.now() + ms;
  for (;;) {
    const now = await page.url();
    if (re.test(now)) return now;
    if (Date.now() > until) throw new Error(`주소가 ${re}로 바뀌지 않았다 (지금 ${now})`);
    await page.waitForTimeout(200);
  }
};

/**
 * 텍스트가 나타날 때까지 기다린다. `waitForSelector`는 CSS만 알아서 `text=`를 못 받는데,
 * `locator`는 받는다 — 그래서 세는 쪽으로 돈다.
 */
const waitForText = async (text, ms = 8000) => {
  const until = Date.now() + ms;
  for (;;) {
    if ((await page.locator(`text=${text}`).count()) > 0) return;
    if (Date.now() > until) throw new Error(`"${text}"가 화면에 나타나지 않았다`);
    await page.waitForTimeout(200);
  }
};

console.log('\n화면이 뜨는가');

/**
 * 경로마다 **그 화면에만 있는 것**을 함께 확인한다.
 *
 * "열렸다"만 보면 안 되는 이유: 세션이 없으면 셸 안쪽 경로가 전부 로그인 화면으로 바뀌는데,
 * 그것도 200이고 그림도 그려진다. 표식을 안 보면 전부 통과로 읽힌다 — 이 저장소가 이미
 * 두 번 겪은 실패 방식이다(지워진 화면을 훑으며 통과하던 예전 SCREENS, 없는 라우트가
 * 404를 내서 통과하던 e2e).
 */
const SCREENS = [
  ['/', 'projects', '.topbar__search'],
  ['/projects', 'projects-alias', 'a[href^="/projects/"]'],
  ['/import', 'import', 'input[type=checkbox]'],
];
for (const [path, name, marker] of SCREENS) {
  await step(name, async () => {
    await open(path);
    await shot(name);
    if ((await page.locator(marker).count()) === 0) {
      throw new Error(`${path}에 ${marker}가 없다 — 로그인 화면으로 튕겼을 수 있다`);
    }
  });
}

console.log('\n눌러 본다');
let projectUrl = '';

await step('프로젝트 목록 → 상세로 들어간다', async () => {
  await open('/projects');
  // 카드 전체가 링크다. 이름 텍스트가 아니라 링크로 집는다 — 이름은 레포명과 겹칠 수 있다.
  await page.locator('a[href^="/projects/"]').first().click();
  const landed = await waitForUrl(/\/projects\/[^/]+$/);
  projectUrl = new URL(landed).pathname;
  await shot('project-detail');
});

await step('상세 화면에 토큰 차트와 목표가 그려진다', async () => {
  await page.waitForSelector('[data-testid="token-stock-chart"]');
  if ((await btn('목표 직접 편집').count()) === 0) throw new Error('목표 편집 버튼이 없다');
});

await step('API 키 모달이 열린다', async () => {
  await btn('API 키 관리').first().click();
  // `dialog[open]`으로 집는다 — 닫힌 <dialog>도 DOM에 남아 있어 그냥 'dialog'는 물린다.
  await page.waitForSelector('dialog[open]');
  await shot('api-keys-modal');
  await page.keyPress('Escape');
  await page.waitForTimeout(300);
});

await step('목표 체크리스트 서랍이 열린다', async () => {
  await open(projectUrl);
  await btn('전체 체크리스트').first().click();
  await page.waitForSelector('dialog[open][aria-label="목표 체크리스트 전체보기"]');
  await shot('goal-checklist');
  await page.keyPress('Escape');
  await page.waitForTimeout(300);
});

await step('상단 검색이 드롭다운에 결과를 그린다', async () => {
  await open('/projects');
  // 목록 화면에도 검색 입력이 하나 더 있다(프로젝트 이름 필터). 상단바 쪽을 정확히 집는다.
  await page.locator('.topbar__search').fill('muster');
  // 결과가 아니라 **옵션이 생기는 것**을 기다린다. 서버가 `query`를 되돌려주지 않으면
  // 화면이 응답을 버리고 "찾는 중…"에 멈추는데, 그건 여기서만 드러난다.
  await page.waitForSelector('[role=option]');
  await shot('search');
});

await step('레포 가져오기 화면에 목록과 버튼이 있다', async () => {
  await open('/import');
  await page.waitForSelector('input[type=checkbox]');
  if ((await btn('가져오기').count()) === 0) throw new Error('가져오기 버튼이 없다');
});

await step('라우트 없는 경로는 NotReadyPage로 떨어진다', async () => {
  await open('/no-such-screen');
  await waitForText('준비 중');
});

await drainNoise();
await stagehand.close();
await browser.close();

const unique = [...new Set(noise)];
console.log('\n콘솔·네트워크 오류:', unique.length ? `\n  ${unique.join('\n  ')}` : '없음');
console.log(`스크린샷: ${SHOTS}`);

if (failures.length || unique.length) {
  console.log(`\n실패 ${failures.length}건, 오류 ${unique.length}건`);
  process.exit(1);
}
console.log('\n전부 통과');
