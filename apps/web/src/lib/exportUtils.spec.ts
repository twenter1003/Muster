import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseFilenameFromHeader, triggerBlobDownload, downloadWasteReport } from './exportUtils';

describe('exportUtils', () => {
  describe('parseFilenameFromHeader', () => {
    it('헤더가 없으면 fallback 파일명을 반환한다', () => {
      expect(parseFilenameFromHeader(null, 'default.csv')).toBe('default.csv');
      expect(parseFilenameFromHeader('', 'default.csv')).toBe('default.csv');
    });

    it('따옴표로 둘러싸인 파일명을 정상 추출한다', () => {
      const header = 'attachment; filename="muster-report-2026.csv"';
      expect(parseFilenameFromHeader(header, 'default.csv')).toBe('muster-report-2026.csv');
    });

    it('따옴표가 없는 파일명을 정상 추출한다', () => {
      const header = 'attachment; filename=muster-report-2026.json';
      expect(parseFilenameFromHeader(header, 'default.json')).toBe('muster-report-2026.json');
    });
  });

  describe('triggerBlobDownload', () => {
    let originalDocument: typeof globalThis.document;

    beforeEach(() => {
      originalDocument = globalThis.document;
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-url');
      globalThis.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      globalThis.document = originalDocument;
      vi.restoreAllMocks();
    });

    it('document가 정의되지 않은 환경에서는 false를 반환하고 에러가 발생하지 않는다', () => {
      // @ts-expect-error test override
      delete globalThis.document;

      const blob = new Blob(['test'], { type: 'text/csv' });
      const result = triggerBlobDownload(blob, 'test.csv');
      expect(result).toBe(false);
    });

    it('가상 a 요소를 통해 다운로드를 트리거하고 true를 반환한다', () => {
      const clickSpy = vi.fn();
      const mockAnchor = {
        href: '',
        download: '',
        click: clickSpy,
      };

      const appendChildSpy = vi.fn();
      const removeChildSpy = vi.fn();

      globalThis.document = {
        createElement: vi.fn().mockReturnValue(mockAnchor),
        body: {
          appendChild: appendChildSpy,
          removeChild: removeChildSpy,
        },
      } as unknown as Document;

      const blob = new Blob(['test'], { type: 'text/csv' });
      const result = triggerBlobDownload(blob, 'test.csv');

      expect(result).toBe(true);
      expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(globalThis.document.createElement).toHaveBeenCalledWith('a');
      expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor);
    });
  });

  describe('downloadWasteReport', () => {
    let originalDocument: typeof globalThis.document;

    beforeEach(() => {
      originalDocument = globalThis.document;
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-url');
      globalThis.URL.revokeObjectURL = vi.fn();

      globalThis.document = {
        createElement: vi.fn().mockReturnValue({
          href: '',
          download: '',
          click: vi.fn(),
        }),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
      } as unknown as Document;
    });

    afterEach(() => {
      globalThis.document = originalDocument;
      vi.restoreAllMocks();
    });

    it('API 성공 시 Blob 다운로드를 수행하고 success: true를 반환한다', async () => {
      const mockBlob = new Blob(['sample,csv'], { type: 'text/csv' });
      const mockHeaders = new Headers();
      mockHeaders.set('content-disposition', 'attachment; filename="custom-report.csv"');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
        blob: async () => mockBlob,
      } as unknown as Response);

      const result = await downloadWasteReport('proj-123', 'csv');

      expect(result.success).toBe(true);
      expect(result.filename).toBe('custom-report.csv');
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/projects/proj-123/waste-report.csv');
    });

    it('API 실패 시 success: false와 에러 메시지를 반환한다', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 403,
      } as unknown as Response);

      const result = await downloadWasteReport('proj-123', 'json');

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 403');
    });
  });
});
