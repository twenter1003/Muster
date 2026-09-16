/**
 * "AI 초안 생성"이 지금 편집 중인 텍스트를 확인 없이 덮어써도 되는지 판단한다.
 *
 * 초안은 저장 전까지 서버에 없다 — 버튼 한 번에 사라지면 실행취소할 방법이 없다.
 * 직접 쓴 것이든 이전 AI 초안이든 구분하지 않는다: 둘 다 "지금 화면에 있고 아직 저장
 * 안 된 것"이라는 점에서 같다. 빈 칸이면 잃을 게 없으니 확인 없이 바로 만든다.
 */
export function shouldConfirmDraftOverwrite(currentDraftText: string): boolean {
  return currentDraftText.trim() !== '';
}
