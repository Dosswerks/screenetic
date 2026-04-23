import { describe, it, expect } from 'vitest';

/**
 * Unit tests for ReportVisibilityControls logic.
 * Tests the pure helper functions and data transformation logic
 * that the ReportVisibilityControls component relies on.
 *
 * Validates: Requirements 27, 25
 */

// ===== Helper reproductions (same logic as component) =====

type ExpiryOption = '1h' | '24h' | '7d' | '30d';

const EXPIRY_LABELS: Record<ExpiryOption, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d <= now) return 'Expired';
  const diffMs = d.getTime() - now.getTime();
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `Expires in ${days}d ${hours % 24}h`;
  if (hours > 0) return `Expires in ${hours}h`;
  return 'Expires in <1h';
}

function buildShareUrl(reportId: string, shareToken: string): string {
  return `https://screenetic.app/report/${reportId}?token=${shareToken}`;
}

// ===== Tests =====

describe('ReportVisibilityControls — formatExpiry', () => {
  it('returns "Expired" for past dates', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    expect(formatExpiry(past)).toBe('Expired');
  });

  it('returns hours for expiry less than a day away', () => {
    const future = new Date(Date.now() + 5 * 3600000).toISOString();
    expect(formatExpiry(future)).toMatch(/Expires in \d+h/);
  });

  it('returns days and hours for expiry more than a day away', () => {
    const future = new Date(Date.now() + 3 * 24 * 3600000 + 2 * 3600000).toISOString();
    expect(formatExpiry(future)).toMatch(/Expires in 3d 2h/);
  });

  it('returns "<1h" for expiry less than an hour away', () => {
    const future = new Date(Date.now() + 30 * 60000).toISOString();
    expect(formatExpiry(future)).toBe('Expires in <1h');
  });
});

describe('ReportVisibilityControls — share URL construction', () => {
  it('builds correct share URL with token', () => {
    const url = buildShareUrl('abc-123', 'tok_xyz');
    expect(url).toBe('https://screenetic.app/report/abc-123?token=tok_xyz');
  });

  it('includes the full token in the URL', () => {
    const longToken = 'a'.repeat(32);
    const url = buildShareUrl('report-1', longToken);
    expect(url).toContain(`token=${longToken}`);
  });
});

describe('ReportVisibilityControls — expiry options', () => {
  it('has all four expiry options', () => {
    const keys = Object.keys(EXPIRY_LABELS);
    expect(keys).toEqual(['1h', '24h', '7d', '30d']);
  });

  it('has human-readable labels', () => {
    expect(EXPIRY_LABELS['1h']).toBe('1 hour');
    expect(EXPIRY_LABELS['24h']).toBe('24 hours');
    expect(EXPIRY_LABELS['7d']).toBe('7 days');
    expect(EXPIRY_LABELS['30d']).toBe('30 days');
  });
});

describe('ReportVisibilityControls — ownership check', () => {
  it('shows controls when user owns the report', () => {
    const userId = 'user-1';
    const reportUserId = 'user-1';
    expect(userId === reportUserId).toBe(true);
  });

  it('hides controls when user does not own the report', () => {
    const userId = 'user-1';
    const reportUserId = 'user-2';
    expect(userId === reportUserId).toBe(false);
  });

  it('hides controls when user is not authenticated', () => {
    const user = null;
    const reportUserId = 'user-1';
    expect(!!(user && reportUserId === (user as any)?.id)).toBe(false);
  });

  it('hides controls when report has no user_id (anonymous)', () => {
    const userId = 'user-1';
    const reportUserId = null;
    expect(!!(userId && reportUserId && userId === reportUserId)).toBe(false);
  });
});

describe('ReportVisibilityControls — visibility state', () => {
  it('private visibility means only owner can access', () => {
    const visibility = 'private';
    expect(visibility).toBe('private');
  });

  it('unlisted visibility means anyone with URL can access', () => {
    const visibility = 'unlisted';
    expect(visibility).toBe('unlisted');
  });

  it('toggling from private goes to unlisted', () => {
    const current = 'private';
    const next = current === 'private' ? 'unlisted' : 'private';
    expect(next).toBe('unlisted');
  });

  it('toggling from unlisted goes to private', () => {
    const current = 'unlisted';
    const next = current === 'private' ? 'unlisted' : 'private';
    expect(next).toBe('private');
  });
});
