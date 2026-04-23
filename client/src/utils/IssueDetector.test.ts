import { describe, it, expect } from 'vitest';
import {
  classifySeverity,
  hasHorizontalOverflow,
  isClsAboveThreshold,
  isTapTargetTooSmall,
  isTextTooSmall,
  isFixedElementOccluding,
  isUnresponsiveLayout,
  MIN_TAP_TARGET_SIZE,
  MIN_FONT_SIZE,
  CLS_THRESHOLD,
  OCCLUSION_THRESHOLD,
  UNRESPONSIVE_TOLERANCE,
} from './IssueDetector';

describe('IssueDetector — pure logic', () => {
  describe('classifySeverity', () => {
    it('classifies horizontal_overflow as issue', () => {
      expect(classifySeverity('horizontal_overflow')).toBe('issue');
    });

    it('classifies tap_target_too_small as issue', () => {
      expect(classifySeverity('tap_target_too_small')).toBe('issue');
    });

    it('classifies text_too_small as issue', () => {
      expect(classifySeverity('text_too_small')).toBe('issue');
    });

    it('classifies missing_viewport_meta as issue', () => {
      expect(classifySeverity('missing_viewport_meta')).toBe('issue');
    });

    it('classifies unresponsive_layout as issue', () => {
      expect(classifySeverity('unresponsive_layout')).toBe('issue');
    });

    it('classifies viewport_clipping as observation', () => {
      expect(classifySeverity('viewport_clipping')).toBe('observation');
    });

    it('classifies fixed_element_occlusion as observation', () => {
      expect(classifySeverity('fixed_element_occlusion')).toBe('observation');
    });

    it('classifies cls_above_threshold as observation', () => {
      expect(classifySeverity('cls_above_threshold')).toBe('observation');
    });
  });

  describe('hasHorizontalOverflow', () => {
    it('returns true when scrollWidth exceeds clientWidth', () => {
      expect(hasHorizontalOverflow(500, 390)).toBe(true);
    });

    it('returns false when scrollWidth equals clientWidth', () => {
      expect(hasHorizontalOverflow(390, 390)).toBe(false);
    });

    it('returns false when scrollWidth is less than clientWidth', () => {
      expect(hasHorizontalOverflow(300, 390)).toBe(false);
    });
  });

  describe('isClsAboveThreshold', () => {
    it('returns true when CLS exceeds threshold', () => {
      expect(isClsAboveThreshold(0.15)).toBe(true);
    });

    it('returns false when CLS equals threshold', () => {
      expect(isClsAboveThreshold(CLS_THRESHOLD)).toBe(false);
    });

    it('returns false when CLS is below threshold', () => {
      expect(isClsAboveThreshold(0.05)).toBe(false);
    });

    it('returns false for zero CLS', () => {
      expect(isClsAboveThreshold(0)).toBe(false);
    });
  });

  describe('isTapTargetTooSmall', () => {
    it('returns true when width is below minimum', () => {
      expect(isTapTargetTooSmall(30, 60)).toBe(true);
    });

    it('returns true when height is below minimum', () => {
      expect(isTapTargetTooSmall(60, 30)).toBe(true);
    });

    it('returns true when both dimensions are below minimum', () => {
      expect(isTapTargetTooSmall(20, 20)).toBe(true);
    });

    it('returns false when both dimensions meet minimum', () => {
      expect(isTapTargetTooSmall(MIN_TAP_TARGET_SIZE, MIN_TAP_TARGET_SIZE)).toBe(false);
    });

    it('returns false when both dimensions exceed minimum', () => {
      expect(isTapTargetTooSmall(60, 60)).toBe(false);
    });
  });

  describe('isTextTooSmall', () => {
    it('returns true for font size below minimum', () => {
      expect(isTextTooSmall(10)).toBe(true);
    });

    it('returns false for font size at minimum', () => {
      expect(isTextTooSmall(MIN_FONT_SIZE)).toBe(false);
    });

    it('returns false for font size above minimum', () => {
      expect(isTextTooSmall(16)).toBe(false);
    });
  });

  describe('isFixedElementOccluding', () => {
    it('returns true when element covers more than 30% of viewport', () => {
      const viewportArea = 390 * 844;
      const elementArea = viewportArea * 0.35;
      expect(isFixedElementOccluding(elementArea, viewportArea)).toBe(true);
    });

    it('returns false when element covers exactly 30% of viewport', () => {
      const viewportArea = 390 * 844;
      const elementArea = viewportArea * OCCLUSION_THRESHOLD;
      expect(isFixedElementOccluding(elementArea, viewportArea)).toBe(false);
    });

    it('returns false when element covers less than 30% of viewport', () => {
      const viewportArea = 390 * 844;
      const elementArea = viewportArea * 0.1;
      expect(isFixedElementOccluding(elementArea, viewportArea)).toBe(false);
    });

    it('returns false when viewport area is zero', () => {
      expect(isFixedElementOccluding(100, 0)).toBe(false);
    });
  });

  describe('isUnresponsiveLayout', () => {
    it('returns true when scrollWidth differs significantly from device width', () => {
      expect(isUnresponsiveLayout(1024, 390)).toBe(true);
    });

    it('returns false when scrollWidth matches device width', () => {
      expect(isUnresponsiveLayout(390, 390)).toBe(false);
    });

    it('returns false when difference is within tolerance', () => {
      expect(isUnresponsiveLayout(390 + UNRESPONSIVE_TOLERANCE, 390)).toBe(false);
    });

    it('returns true when difference exceeds tolerance by 1px', () => {
      expect(isUnresponsiveLayout(390 + UNRESPONSIVE_TOLERANCE + 1, 390)).toBe(true);
    });

    it('detects narrower-than-viewport layouts too', () => {
      expect(isUnresponsiveLayout(320, 390)).toBe(true);
    });
  });

  describe('constants', () => {
    it('MIN_TAP_TARGET_SIZE is 48', () => {
      expect(MIN_TAP_TARGET_SIZE).toBe(48);
    });

    it('MIN_FONT_SIZE is 12', () => {
      expect(MIN_FONT_SIZE).toBe(12);
    });

    it('CLS_THRESHOLD is 0.1', () => {
      expect(CLS_THRESHOLD).toBe(0.1);
    });

    it('OCCLUSION_THRESHOLD is 0.3', () => {
      expect(OCCLUSION_THRESHOLD).toBe(0.3);
    });

    it('UNRESPONSIVE_TOLERANCE is 20', () => {
      expect(UNRESPONSIVE_TOLERANCE).toBe(20);
    });
  });
});
