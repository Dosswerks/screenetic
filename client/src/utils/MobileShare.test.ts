import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { canNativeShare, canShareFiles, shareReport } from './MobileShare';
import type { ShareOptions } from './MobileShare';

/**
 * Unit tests for MobileShare utility.
 * Tests the pure detection helpers and the sharing cascade logic.
 *
 * Validates: Requirements 10
 */

describe('canNativeShare', () => {
  const originalShare = navigator.share;

  afterEach(() => {
    Object.defineProperty(navigator, 'share', {
      value: originalShare,
      writable: true,
      configurable: true,
    });
  });

  it('returns true when navigator.share is a function', () => {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    expect(canNativeShare()).toBe(true);
  });

  it('returns false when navigator.share is undefined', () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(canNativeShare()).toBe(false);
  });
});

describe('canShareFiles', () => {
  const originalCanShare = navigator.canShare;

  afterEach(() => {
    Object.defineProperty(navigator, 'canShare', {
      value: originalCanShare,
      writable: true,
      configurable: true,
    });
  });

  it('returns true when canShare supports files', () => {
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn().mockReturnValue(true),
      writable: true,
      configurable: true,
    });
    expect(canShareFiles()).toBe(true);
  });

  it('returns false when canShare is not available', () => {
    Object.defineProperty(navigator, 'canShare', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(canShareFiles()).toBe(false);
  });

  it('returns false when canShare returns false for files', () => {
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn().mockReturnValue(false),
      writable: true,
      configurable: true,
    });
    expect(canShareFiles()).toBe(false);
  });

  it('returns false when canShare throws', () => {
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn().mockImplementation(() => { throw new Error('not supported'); }),
      writable: true,
      configurable: true,
    });
    expect(canShareFiles()).toBe(false);
  });
});

describe('shareReport', () => {
  const originalShare = navigator.share;
  const originalCanShare = navigator.canShare;
  let openSpy: ReturnType<typeof vi.spyOn>;

  const baseOptions: ShareOptions = {
    title: 'Test Report',
    url: 'https://example.com/report/123',
    text: 'Check out this report',
  };

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'share', {
      value: originalShare,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'canShare', {
      value: originalCanShare,
      writable: true,
      configurable: true,
    });
    openSpy.mockRestore();
  });

  it('uses native share with file when supported', async () => {
    const shareFn = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: shareFn,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn().mockReturnValue(true),
      writable: true,
      configurable: true,
    });

    const file = new File(['pdf-data'], 'report.pdf', { type: 'application/pdf' });
    const result = await shareReport({ ...baseOptions, file });

    expect(result).toEqual({ method: 'native', success: true });
    expect(shareFn).toHaveBeenCalledWith(
      expect.objectContaining({ files: [file] }),
    );
  });

  it('returns native success:false when user cancels file share', async () => {
    const abortError = new DOMException('User cancelled', 'AbortError');
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(abortError),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn().mockReturnValue(true),
      writable: true,
      configurable: true,
    });

    const file = new File(['pdf-data'], 'report.pdf', { type: 'application/pdf' });
    const result = await shareReport({ ...baseOptions, file });

    expect(result).toEqual({ method: 'native', success: false });
  });

  it('falls back to link-only share when file share fails', async () => {
    let callCount = 0;
    const shareFn = vi.fn().mockImplementation((data: ShareData) => {
      callCount++;
      if (callCount === 1 && data.files) {
        return Promise.reject(new Error('File sharing not supported'));
      }
      return Promise.resolve();
    });
    Object.defineProperty(navigator, 'share', {
      value: shareFn,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn().mockReturnValue(true),
      writable: true,
      configurable: true,
    });

    const file = new File(['pdf-data'], 'report.pdf', { type: 'application/pdf' });
    const result = await shareReport({ ...baseOptions, file });

    expect(result).toEqual({ method: 'link-only', success: true });
    expect(shareFn).toHaveBeenCalledTimes(2);
  });

  it('uses link-only share when no file is provided', async () => {
    const shareFn = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: shareFn,
      writable: true,
      configurable: true,
    });

    const result = await shareReport(baseOptions);

    expect(result).toEqual({ method: 'link-only', success: true });
    expect(shareFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test Report', url: baseOptions.url }),
    );
  });

  it('falls back to mailto when navigator.share is unavailable', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const result = await shareReport(baseOptions);

    expect(result).toEqual({ method: 'mailto', success: true });
    expect(openSpy).toHaveBeenCalledTimes(1);
    const mailtoUrl = openSpy.mock.calls[0][0] as string;
    expect(mailtoUrl).toMatch(/^mailto:\?subject=/);
    expect(mailtoUrl).toContain(encodeURIComponent(baseOptions.title));
  });

  it('falls back to download when mailto fails and file is provided', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    openSpy.mockImplementation(() => { throw new Error('blocked'); });

    const file = new File(['pdf-data'], 'report.pdf', { type: 'application/pdf' });
    const clickSpy = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as unknown as HTMLAnchorElement);
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const result = await shareReport({ ...baseOptions, file });

    expect(result).toEqual({ method: 'download', success: true });
    expect(clickSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
    revokeUrlSpy.mockRestore();
  });

  it('returns none when all methods fail and no file provided', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    openSpy.mockImplementation(() => { throw new Error('blocked'); });

    const result = await shareReport(baseOptions);

    expect(result).toEqual({ method: 'none', success: false });
  });
});
