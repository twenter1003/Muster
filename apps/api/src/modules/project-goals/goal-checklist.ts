export interface GoalCheckItem {
  index: number;
  title: string;
  completed: boolean;
  rawLine: string;
}

const TASK_ITEM_REGEX = /^(\s*[-*]\s*\[)([ xX])(\]\s+)(.+)$/;
const BULLET_ITEM_REGEX = /^(\s*(?:[-*]|\d+\.)\s+)(.+)$/;

/**
 * 마크다운 문서에서 체크리스트 목표 항목들을 파싱한다.
 *
 * 1. 문서 내에 `- [ ]` 또는 `- [x]` 형태의 마크다운 태스크 리스트가 1개 이상 존재하면,
 *    해당 체크박스 항목들만 정량적 목표 항목으로 추출한다.
 * 2. 체크박스가 하나도 없지만 일반 불릿(`- `, `* `)이나 번호 리스트(`1. `)가 있다면,
 *    하위 호환성을 위해 해당 불릿 항목들을 미완료(- [ ]) 목표로 추출한다.
 */
export function parseGoalChecklist(contentMd: string | null | undefined): GoalCheckItem[] {
  if (!contentMd || contentMd.trim() === '') {
    return [];
  }

  const lines = contentMd.split('\n');

  // 문서 전체에 태스크 체크박스가 있는지 검사
  const hasAnyCheckbox = lines.some((line) => TASK_ITEM_REGEX.test(line));

  const items: GoalCheckItem[] = [];
  let currentIndex = 0;

  for (const line of lines) {
    if (hasAnyCheckbox) {
      const match = line.match(TASK_ITEM_REGEX);
      if (match) {
        const isChecked = match[2].toLowerCase() === 'x';
        const title = match[4].trim();
        items.push({
          index: currentIndex++,
          title,
          completed: isChecked,
          rawLine: line,
        });
      }
    } else {
      const match = line.match(BULLET_ITEM_REGEX);
      if (match) {
        const title = match[2].trim();
        items.push({
          index: currentIndex++,
          title,
          completed: false,
          rawLine: line,
        });
      }
    }
  }

  return items;
}

/**
 * 목표 마크다운 문서에서 지정된 completedIndices에 해당하는 항목을 [x]로 업데이트한다.
 *
 * 기존 줄바꿈, 헤딩, 주석, 미완료 항목의 인덴트 등을 100% 보존한다.
 */
export function updateChecklistContent(contentMd: string, completedIndices: number[]): string {
  if (!contentMd || completedIndices.length === 0) {
    return contentMd;
  }

  const targetSet = new Set(completedIndices);
  const lines = contentMd.split('\n');
  const hasAnyCheckbox = lines.some((line) => TASK_ITEM_REGEX.test(line));

  let currentIndex = 0;
  const updatedLines = lines.map((line) => {
    if (hasAnyCheckbox) {
      const match = line.match(TASK_ITEM_REGEX);
      if (match) {
        const idx = currentIndex++;
        if (targetSet.has(idx)) {
          // [ ] -> [x]
          return `${match[1]}x${match[3]}${match[4]}`;
        }
      }
    } else {
      const match = line.match(BULLET_ITEM_REGEX);
      if (match) {
        const idx = currentIndex++;
        if (targetSet.has(idx)) {
          // '- 항목' -> '- [x] 항목'
          return `- [x] ${match[2]}`;
        }
      }
    }
    return line;
  });

  return updatedLines.join('\n');
}

/**
 * 체크리스트 항목들로부터 정량적/결정론적 진행률(0~100%)을 계산한다.
 */
export function calculateProgressPercent(items: GoalCheckItem[]): number {
  if (items.length === 0) {
    return 0;
  }
  const completedCount = items.filter((item) => item.completed).length;
  return Math.max(0, Math.min(100, Math.round((completedCount / items.length) * 100)));
}
