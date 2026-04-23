import { describe, it, expect } from 'vitest';
import type { DetectedIssue, IssueType } from '@shared/types';
import {
  getColorForSeverity,
  getBadgePosition,
  getLocatedIssues,
  buildLegendText,
  getIssueTypeLabel,
} from './AnnotationRenderer';

/** Helper to create a DetectedIssue with defaults */
function makeIssue(overrides: Partial<DetectedIssue> & { type: IssueType }): DetectedIssue {
  return {
    severity: 'issue',
    description: 'Test issue',
    location: null,
    details: {},
    ...overrides,
  };
}

describe('AnnotationRenderer — pure helpers', () => {
  describe('getColorForSeverity', () => {
    it('returns red colors for issue severity', () => {
      const colors = getColorForSeverity('issue');
      expect(colors.fill).toBe('rgba(220, 50, 50, 0.25)');
      expect(colors.stroke).toBe('rgb(220, 50, 50)');
    });

    it('returns yellow colors for observation severity', () => {
      const colors = getColorForSeverity('observation');
      expect(colors.fill).toBe('rgba(220, 180, 50, 0.25)');
      expect(colors.stroke).toBe('rgb(220, 180, 50)');
    });
  });

  describe('getBadgePosition', () => {
    it('places badge center offset by half the badge diameter from the top-left corner', () => {
      const pos = getBadgePosition({ x: 100, y: 200 });
      // Badge diameter is 18, so radius is 9
      expect(pos.cx).toBe(109);
      expect(pos.cy).toBe(209);
    });

    it('handles zero coordinates', () => {
      const pos = getBadgePosition({ x: 0, y: 0 });
      expect(pos.cx).toBe(9);
      expect(pos.cy).toBe(9);
    });
  });

  describe('getLocatedIssues', () => {
    it('returns only issues that have a location', () => {
      const issues: DetectedIssue[] = [
        makeIssue({ type: 'horizontal_overflow', location: { x: 0, y: 0, width: 100, height: 50 } }),
        makeIssue({ type: 'missing_viewport_meta', location: null }),
        makeIssue({ type: 'tap_target_too_small', location: { x: 10, y: 20, width: 30, height: 30 } }),
      ];

      const located = getLocatedIssues(issues);
      expect(located).toHaveLength(2);
      expect(located[0].type).toBe('horizontal_overflow');
      expect(located[1].type).toBe('tap_target_too_small');
    });

    it('returns empty array when no issues have locations', () => {
      const issues: DetectedIssue[] = [
        makeIssue({ type: 'missing_viewport_meta' }),
        makeIssue({ type: 'cls_above_threshold' }),
      ];

      expect(getLocatedIssues(issues)).toHaveLength(0);
    });

    it('returns empty array for empty input', () => {
      expect(getLocatedIssues([])).toHaveLength(0);
    });
  });

  describe('buildLegendText', () => {
    it('builds numbered legend from located issues', () => {
      const issues: DetectedIssue[] = [
        makeIssue({ type: 'horizontal_overflow', location: { x: 0, y: 0, width: 100, height: 50 } }),
        makeIssue({ type: 'tap_target_too_small', location: { x: 10, y: 20, width: 30, height: 30 } }),
      ];

      const text = buildLegendText(issues);
      expect(text).toBe('1: Horizontal overflow  2: Tap target too small');
    });

    it('handles a single issue', () => {
      const issues: DetectedIssue[] = [
        makeIssue({ type: 'text_too_small', location: { x: 5, y: 5, width: 200, height: 20 } }),
      ];

      expect(buildLegendText(issues)).toBe('1: Text too small to read');
    });

    it('returns empty string for empty input', () => {
      expect(buildLegendText([])).toBe('');
    });
  });

  describe('getIssueTypeLabel', () => {
    const expectedLabels: Record<IssueType, string> = {
      horizontal_overflow: 'Horizontal overflow',
      viewport_clipping: 'Viewport content clipping',
      fixed_element_occlusion: 'Fixed element occlusion',
      cls_above_threshold: 'CLS above threshold',
      tap_target_too_small: 'Tap target too small',
      text_too_small: 'Text too small to read',
      missing_viewport_meta: 'Missing viewport meta tag',
      unresponsive_layout: 'Unresponsive layout',
    };

    for (const [type, label] of Object.entries(expectedLabels)) {
      it(`returns "${label}" for ${type}`, () => {
        expect(getIssueTypeLabel(type as IssueType)).toBe(label);
      });
    }
  });
});
