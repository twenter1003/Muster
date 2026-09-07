/**
 * 테스트 환경변수. ConfigModule.forRoot()는 모듈 import 시점에 실행되므로
 * beforeAll에서 설정하면 늦는다. setupFiles는 테스트 모듈 로드 전에 돌아간다.
 *
 * OAuth 자격증명은 더미다 — GitHub 호출은 FakeGitHubClient가 가로채므로 밖으로 나가지 않는다.
 */
process.env.GITHUB_OAUTH_CLIENT_ID = 'test-client-id';
process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.SECRETS_DIR = '.secrets-test';
