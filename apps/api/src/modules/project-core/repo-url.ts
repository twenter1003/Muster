import { ApiException } from '../../common/errors/api.exception';

export interface RepoRef {
  owner: string;
  repo: string;
}

/**
 * GitHub 레포 URL에서 owner/repo를 뽑는다.
 *
 * 사용자가 주소창에서 복사해 올 수 있는 형태를 폭넓게 받되, github.com이 아닌 호스트는
 * 거부한다 — 설계서 Part 1 §9가 "타 Git 호스팅 지원은 범위 외"로 못박았고,
 * 임의 호스트를 그대로 API 호출에 쓰면 SSRF 통로가 된다.
 */
export function parseRepoUrl(input: string): RepoRef {
  const trimmed = input.trim();

  let url: URL;
  try {
    // scheme이 없으면 붙여 준다 (github.com/owner/repo 형태 허용).
    url = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw ApiException.validationFailed('repo_url 형식이 올바르지 않습니다.');
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
    throw ApiException.validationFailed('github.com의 https 주소만 지원합니다.');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw ApiException.validationFailed('repo_url에서 owner/repo를 찾을 수 없습니다.');
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, '');

  // GitHub이 허용하는 문자만 통과시킨다. 경로 조작으로 다른 엔드포인트를 때리지 못하게 한다.
  const NAME = /^[A-Za-z0-9._-]+$/;
  if (!NAME.test(owner) || !NAME.test(repo) || repo === '') {
    throw ApiException.validationFailed('owner 또는 repo 이름에 허용되지 않는 문자가 있습니다.');
  }

  return { owner, repo };
}
