import { parseRepoUrl } from './repo-url';
import { ApiException } from '../../common/errors/api.exception';

describe('parseRepoUrl', () => {
  it.each([
    ['https://github.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world.git', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world/', 'octocat', 'hello-world'],
    ['github.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world/tree/main', 'octocat', 'hello-world'],
    ['https://GitHub.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['  https://github.com/octocat/hello-world  ', 'octocat', 'hello-world'],
    ['https://github.com/my-org/my.repo_name-1', 'my-org', 'my.repo_name-1'],
  ])('%s → %s/%s', (input, owner, repo) => {
    expect(parseRepoUrl(input)).toEqual({ owner, repo });
  });

  it.each([
    ['https://gitlab.com/a/b', '타 호스팅은 범위 외 (설계서 Part 1 §9)'],
    ['http://github.com/a/b', 'https가 아님'],
    ['https://github.com/onlyowner', 'repo가 없음'],
    ['https://github.com/', '경로가 없음'],
    ['https://evil.com/github.com/a/b', 'github.com이 호스트가 아님'],
    ['https://github.com.evil.com/a/b', '호스트 접미사 속임수'],
    ['not a url at all', 'URL이 아님'],
    ['', '빈 문자열'],
  ])('%s 는 거부한다 — %s', (input) => {
    expect(() => parseRepoUrl(input)).toThrow(ApiException);
  });

  it('경로 조작 문자가 든 이름은 거부한다', () => {
    expect(() => parseRepoUrl('https://github.com/..%2F..%2Fetc/passwd')).toThrow(ApiException);
  });
});
