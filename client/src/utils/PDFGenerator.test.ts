import { describe, it, expect } from 'vitest';
import { blobToBase64, formatMetricForPDF } from './PDFGenerator';

describe('PDFGenerator — pure helpers', () => {
  describe('blobToBase64', () => {
    it('converts a text blob to a base64 data URL', async () => {
      const blob = new Blob(['hello world'], { type: 'text/plain' });
      const result = await blobToBase64(blob);
      expect(result).toMatch(/^data:text\/plain;base64,/);
      // Decode and verify content
      const base64Part = result.split(',')[1];
      const decoded = atob(base64Part);
      expect(decoded).toBe('hello world');
    });

    it('converts an empty blob to a base64 data URL', async () => {
      const blob = new Blob([], { type: 'application/octet-stream' });
      const result = await blobToBase64(blob);
      expect(result).toMatch(/^data:application\/octet-stream;base64,/);
    });

    it('preserves binary data through round-trip', async () => {
      const bytes = new Uint8Array([0, 1, 127, 128, 255]);
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const result = await blobToBase64(blob);
      const base64Part = result.split(',')[1];
      const decoded = atob(base64Part);
      expect(decoded.length).toBe(5);
      expect(decoded.charCodeAt(0)).toBe(0);
      expect(decoded.charCodeAt(1)).toBe(1);
      expect(decoded.charCodeAt(2)).toBe(127);
      expect(decoded.charCodeAt(3)).toBe(128);
      expect(decoded.charCodeAt(4)).toBe(255);
    });

    it('includes the correct MIME type in the data URL', async () => {
      const blob = new Blob(['{}'], { type: 'application/json' });
      const result = await blobToBase64(blob);
      expect(result).toMatch(/^data:application\/json;base64,/);
    });
  });

  describe('formatMetricForPDF', () => {
    it('returns "N/A" for null values', () => {
      expect(formatMetricForPDF(null, 'ms')).toBe('N/A');
    });

    it('formats millisecond values with rounding', () => {
      expect(formatMetricForPDF(1234.5, 'ms')).toBe('1235 ms');
      expect(formatMetricForPDF(0, 'ms')).toBe('0 ms');
      expect(formatMetricForPDF(99.4, 'ms')).toBe('99 ms');
    });

    it('formats score values to 3 decimal places', () => {
      expect(formatMetricForPDF(0.1, 'score')).toBe('0.100');
      expect(formatMetricForPDF(0.0456, 'score')).toBe('0.046');
      expect(formatMetricForPDF(0, 'score')).toBe('0.000');
    });

    it('formats KB values to 1 decimal place', () => {
      expect(formatMetricForPDF(1024.567, 'KB')).toBe('1024.6 KB');
      expect(formatMetricForPDF(0, 'KB')).toBe('0.0 KB');
    });

    it('formats count values with the unit', () => {
      expect(formatMetricForPDF(42, 'count')).toBe('42 count');
      expect(formatMetricForPDF(0, 'count')).toBe('0 count');
    });
  });
});
