export interface GoalCheckItem {
  index: number;
  title: string;
  completed: boolean;
}

const TASK_ITEM_REGEX = /^(\s*[-*]\s*\[)([ xX])(\]\s+)(.+)$/;
const BULLET_ITEM_REGEX = /^(\s*(?:[-*]|\d+\.)\s+)(.+)$/;

/**
 * 마크다운 목표 문서에서 체크리스트 목록을 파싱한다.
 */
export function parseGoalChecklist(contentMd: string | null | undefined): GoalCheckItem[] {
  if (!contentMd || contentMd.trim() === '') {
    return [];
  }

  const lines = contentMd.split('\n');
  const hasAnyCheckbox = lines.some((line) => TASK_ITEM_REGEX.test(line));

  const items: GoalCheckItem[] = [];
  let currentIndex = 0;

  for (const line of lines) {
    if (hasAnyCheckbox) {
      const match = line.match(TASK_ITEM_REGEX);
      if (match) {
        const isChecked = match[2].toLowerCase() === 'x';
        items.push({
          index: currentIndex++,
          title: match[4].trim(),
          completed: isChecked,
        });
      }
    } else {
      const match = line.match(BULLET_ITEM_REGEX);
      if (match) {
        items.push({
          index: currentIndex++,
          title: match[2].trim(),
          completed: false,
        });
      }
    }
  }

  return items;
}

/**
 * 인덱스에 해당하는 항목의 체크 상태를 토글([ ] <-> [x])한 새 마크다운을 반환한다.
 */
export function toggleGoalChecklist(contentMd: string, targetIndex: number): string {
  if (!contentMd) return '';

  const lines = contentMd.split('\n');
  const hasAnyCheckbox = lines.some((line) => TASK_ITEM_REGEX.test(line));

  let currentIndex = 0;
  const updatedLines = lines.map((line) => {
    if (hasAnyCheckbox) {
      const match = line.match(TASK_ITEM_REGEX);
      if (match) {
        const idx = currentIndex++;
        if (idx === targetIndex) {
          const isCurrentlyChecked = match[2].toLowerCase() === 'x';
          const nextState = isCurrentlyChecked ? ' ' : 'x';
          return `${match[1]}${nextState}${match[3]}${match[4]}`;
        }
      }
    } else {
      const match = line.match(BULLET_ITEM_REGEX);
      if (match) {
        const idx = currentIndex++;
        if (idx === targetIndex) {
          return `- [x] ${match[2]}`;
        }
      }
    }
    return line;
  });

  return updatedLines.join('\n');
}

/**
 * 마크다운 목표 문서로부터 마일스톤 완료율 및 통계를 산출한다.
 */
export function getGoalsProgressStats(contentMd: string | null | undefined): {
  total: number;
  completed: number;
  percent: number;
} {
  const items = parseGoalChecklist(contentMd);
  if (items.length === 0) {
    return { total: 0, completed: 0, percent: 0 };
  }
  const completed = items.filter((i) => i.completed).length;
  const percent = Math.max(0, Math.min(100, Math.round((completed / items.length) * 100)));
  return {
    total: items.length,
    completed,
    percent,
  };
}
