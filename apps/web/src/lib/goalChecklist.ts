export interface GoalCheckItem {
  index: number;
  title: string;
  completed: boolean;
  section?: string;
}

export interface GoalSection {
  id: string;
  title: string;
  items: GoalCheckItem[];
  completedCount: number;
  totalCount: number;
  percent: number;
}

const TASK_ITEM_REGEX = /^(\s*[-*]\s*\[)([ xX])(\]\s+)(.+)$/;
const BULLET_ITEM_REGEX = /^(\s*(?:[-*]|\d+\.)\s+)(.+)$/;
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/;

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

/**
 * 마크다운 목표 문서에서 헤더(#, ##, ...)를 기준으로 섹션(마일스톤)별 체크리스트 목록을 파싱한다.
 * 헤더가 없는 경우 단일 섹션(title: '')으로 반환된다.
 * 각 항목의 index는 문서 전체 기준의 고유 인덱스를 유지하여 toggleGoalChecklist와 완벽히 호환된다.
 */
export function parseGoalChecklistSections(
  contentMd: string | null | undefined,
): GoalSection[] {
  if (!contentMd || contentMd.trim() === '') {
    return [];
  }

  const lines = contentMd.split('\n');
  const hasAnyCheckbox = lines.some((line) => TASK_ITEM_REGEX.test(line));

  const sections: GoalSection[] = [];
  let currentSectionTitle = '';
  let currentSectionItems: GoalCheckItem[] = [];
  let sectionIndex = 0;
  let globalIndex = 0;

  const pushCurrentSection = () => {
    if (currentSectionItems.length > 0) {
      const completedCount = currentSectionItems.filter((i) => i.completed).length;
      const totalCount = currentSectionItems.length;
      const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
      sections.push({
        id: `sec-${sectionIndex++}`,
        title: currentSectionTitle,
        items: currentSectionItems,
        completedCount,
        totalCount,
        percent,
      });
      currentSectionItems = [];
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(HEADING_REGEX);
    if (headingMatch) {
      pushCurrentSection();
      currentSectionTitle = headingMatch[2].trim();
      continue;
    }

    if (hasAnyCheckbox) {
      const match = line.match(TASK_ITEM_REGEX);
      if (match) {
        const isChecked = match[2].toLowerCase() === 'x';
        currentSectionItems.push({
          index: globalIndex++,
          title: match[4].trim(),
          completed: isChecked,
          section: currentSectionTitle || undefined,
        });
      }
    } else {
      const match = line.match(BULLET_ITEM_REGEX);
      if (match) {
        currentSectionItems.push({
          index: globalIndex++,
          title: match[2].trim(),
          completed: false,
          section: currentSectionTitle || undefined,
        });
      }
    }
  }

  pushCurrentSection();
  return sections;
}
