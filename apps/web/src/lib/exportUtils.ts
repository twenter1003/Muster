import { API_BASE } from './api';

/**
 * 브라우저 가상 <a> 요소를 통해 Blob 파일을 다운로드한다.
 */
export function triggerBlobDownload(blob: Blob, filename: string): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * Content-Disposition 헤더에서 파일명을 파싱한다.
 */
export function parseFilenameFromHeader(headerValue: string | null, fallback: string): string {
  if (!headerValue) return fallback;
  const match = headerValue.match(/filename="?([^";]+)"?/);
  return match && match[1] ? match[1].trim() : fallback;
}

export interface ExportReportResult {
  success: boolean;
  filename: string;
  error?: string;
}

/**
 * 서버의 프로젝트 세션 낭비 리포트(CSV 또는 JSON)를 다운로드한다.
 */
export async function downloadWasteReport(
  projectId: string,
  format: 'csv' | 'json',
): Promise<ExportReportResult> {
  const fallbackFilename = `muster-waste-report-${projectId}.${format}`;
  try {
    const res = await fetch(`${API_BASE}/projects/${projectId}/waste-report.${format}`);
    if (!res.ok) {
      throw new Error(`다운로드 실패 (HTTP ${res.status})`);
    }

    const disposition = res.headers.get('content-disposition');
    const filename = parseFilenameFromHeader(disposition, fallbackFilename);
    const blob = await res.blob();
    triggerBlobDownload(blob, filename);

    return { success: true, filename };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : '알 수 없는 오류';
    return { success: false, filename: fallbackFilename, error: errorMsg };
  }
}
