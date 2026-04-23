import { describe, it, expect } from 'vitest';
import {
  formatTime,
  calcPercent,
  stageLabel,
  statusIcon,
} from './ReportProgress';

describe('ReportProgress — pure helpers', () => {
  describe('formatTime', () => {
    it('formats 0ms as 0m 0s', () => {
      expect(formatTime(0)).toBe('0m 0s');
    });

    it('formats seconds only', () => {
      expect(formatTime(45_000)).toBe('0m 45s');
    });

    it('formats minutes and seconds', () => {
      expect(formatTime(125_000)).toBe('2m 5s');
    });

    it('floors partial seconds', () => {
      expect(formatTime(61_999)).toBe('1m 1s');
    });

    it('handles negative values as 0m 0s', () => {
      expect(formatTime(-5000)).toBe('0m 0s');
    });

    it('handles large values', () => {
      expect(formatTime(3_600_000)).toBe('60m 0s');
    });
  });

  describe('calcPercent', () => {
    it('returns 0 when total is 0', () => {
      expect(calcPercent(0, 0)).toBe(0);
    });

    it('returns 0 when nothing completed', () => {
      expect(calcPercent(0, 10)).toBe(0);
    });

    it('returns 100 when all completed', () => {
      expect(calcPercent(5, 5)).toBe(100);
    });

    it('rounds to nearest integer', () => {
      expect(calcPercent(1, 3)).toBe(33);
    });

    it('clamps to 100 if completed exceeds total', () => {
      expect(calcPercent(6, 5)).toBe(100);
    });

    it('returns 50 for half', () => {
      expect(calcPercent(5, 10)).toBe(50);
    });
  });

  describe('stageLabel', () => {
    it('maps queued', () => {
      expect(stageLabel('queued')).toBe('Queued');
    });

    it('maps loading', () => {
      expect(stageLabel('loading')).toBe('Loading page');
    });

    it('maps settling', () => {
      expect(stageLabel('settling')).toBe('Waiting for page settle');
    });

    it('maps capturing', () => {
      expect(stageLabel('capturing')).toBe('Capturing screenshot');
    });

    it('maps analyzing', () => {
      expect(stageLabel('analyzing')).toBe('Collecting metrics');
    });

    it('maps complete', () => {
      expect(stageLabel('complete')).toBe('Complete');
    });

    it('maps failed', () => {
      expect(stageLabel('failed')).toBe('Failed');
    });

    it('maps skipped', () => {
      expect(stageLabel('skipped')).toBe('Skipped');
    });
  });

  describe('statusIcon', () => {
    it('returns ⏳ for queued', () => {
      expect(statusIcon('queued')).toBe('⏳');
    });

    it('returns 🔄 for loading', () => {
      expect(statusIcon('loading')).toBe('🔄');
    });

    it('returns 🔄 for settling', () => {
      expect(statusIcon('settling')).toBe('🔄');
    });

    it('returns 🔄 for capturing', () => {
      expect(statusIcon('capturing')).toBe('🔄');
    });

    it('returns 🔄 for analyzing', () => {
      expect(statusIcon('analyzing')).toBe('🔄');
    });

    it('returns ✅ for complete', () => {
      expect(statusIcon('complete')).toBe('✅');
    });

    it('returns ❌ for failed', () => {
      expect(statusIcon('failed')).toBe('❌');
    });

    it('returns ⏭️ for skipped', () => {
      expect(statusIcon('skipped')).toBe('⏭️');
    });
  });
});
