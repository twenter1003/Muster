/**
 * 시크릿 보관 계약.
 *
 * 설계서 Part 2 §6.2: GitHub 웹훅 시크릿·Claude API 키 등은 GCP Secret Manager에 저장하고
 * 런타임에 주입한다. DB나 코드에 평문으로 두지 않는다.
 *
 * DB에는 이 인터페이스가 돌려주는 **참조(ref)**만 저장한다
 * (GIT_INTEGRATIONS.webhook_secret_ref, USERS.github_token_ref).
 */
export interface SecretStore {
  /** 시크릿을 저장하고 DB에 넣을 참조 문자열을 돌려준다. */
  put(name: string, value: string): Promise<string>;

  /** 참조로 원문을 읽는다. 없으면 null. */
  get(ref: string): Promise<string | null>;

  /** 참조가 가리키는 시크릿을 폐기한다. 없으면 조용히 넘어간다. */
  delete(ref: string): Promise<void>;
}

export const SECRET_STORE = Symbol('SECRET_STORE');
