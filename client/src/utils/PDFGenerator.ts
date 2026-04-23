import jsPDF from 'jspdf';
import type { ReportData, DeviceReportEntry, PerformanceMetrics, DetectedIssue } from '@shared/types';

// ===== Constants =====

const PAGE_WIDTH = 210; // A4 mm
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const CONTENT_HEIGHT = PAGE_HEIGHT - 2 * MARGIN - 10; // 10mm reserved for footer
const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100MB
const JPEG_QUALITY = 0.7;

// ===== Pure helpers (exported for testing) =====

/**
 * Converts a Blob to a base64 data URL.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read blob as base64'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Formats a metric value for PDF display.
 * Returns "N/A" for null values, otherwise formats the number with the unit.
 */
export function formatMetricForPDF(value: number | null, unit: string): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (unit === 'score') {
    return value.toFixed(3);
  }
  if (unit === 'ms') {
    return `${Math.round(value)} ms`;
  }
  if (unit === 'KB') {
    return `${value.toFixed(1)} KB`;
  }
  return `${value} ${unit}`;
}

// ===== Internal helpers =====

function getDeviceLabel(entry: DeviceReportEntry): string {
  const c = entry.config;
  const w = c.orientation === 'landscape' ? c.height : c.width;
  const h = c.orientation === 'landscape' ? c.width : c.height;
  return `${c.deviceId ?? 'Custom'} — ${w}×${h} @${c.dpr}x — ${c.browser} (${c.orientation})`;
}

function addFooter(doc: jsPDF, pageNum: number, totalPages: number): void {
  const y = PAGE_HEIGHT - 8;
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_WIDTH / 2, y, { align: 'center' });
}

function addNewPageIfNeeded(doc: jsPDF, currentY: number, requiredSpace: number): number {
  if (currentY + requiredSpace > MARGIN + CONTENT_HEIGHT) {
    doc.addPage();
    return MARGIN;
  }
  return currentY;
}

// ===== PDF Section Builders =====

function addTitlePage(doc: jsPDF, report: ReportData): void {
  const centerX = PAGE_WIDTH / 2;

  // Title
  doc.setFontSize(28);
  doc.setTextColor(30, 30, 30);
  doc.text('Screenetic Report', centerX, 80, { align: 'center' });

  // URL
  doc.setFontSize(14);
  doc.setTextColor(80, 80, 80);
  const urlLines = doc.splitTextToSize(report.url, CONTENT_WIDTH);
  doc.text(urlLines, centerX, 100, { align: 'center' });

  // Date
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  const dateStr = new Date(report.generatedAt).toLocaleString();
  doc.text(`Generated: ${dateStr}`, centerX, 120, { align: 'center' });

  // Device count
  doc.text(`Devices tested: ${report.devices.length}`, centerX, 130, { align: 'center' });

  // Version info
  doc.setFontSize(9);
  doc.text(`Screenetic v${report.screenenticVersion}`, centerX, 145, { align: 'center' });
  doc.text(`Device Database v${report.deviceDatabaseVersion}`, centerX, 152, { align: 'center' });

  // Auto audit info
  if (report.isAutoAudit && report.autoAuditMethodology) {
    doc.text(`Auto Audit: ${report.autoAuditMethodology}`, centerX, 162, { align: 'center' });
  }

  // Network/CPU profiles
  if (report.networkProfile) {
    doc.text(`Network: ${report.networkProfile}`, centerX, 172, { align: 'center' });
  }
  if (report.cpuProfile) {
    doc.text(`CPU: ${report.cpuProfile}`, centerX, 179, { align: 'center' });
  }
}

function addTableOfContents(
  doc: jsPDF,
  report: ReportData,
  devicePageMap: Map<number, number>,
): void {
  doc.addPage();
  let y = MARGIN;

  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text('Table of Contents', MARGIN, y + 8);
  y += 18;

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);

  // Fixed sections
  doc.text('Executive Summary', MARGIN, y);
  doc.text('Page 3', PAGE_WIDTH - MARGIN, y, { align: 'right' });
  y += 7;

  // Device entries
  report.devices.forEach((entry, idx) => {
    y = addNewPageIfNeeded(doc, y, 7);
    const label = getDeviceLabel(entry);
    const truncated = label.length > 70 ? label.substring(0, 67) + '...' : label;
    const pageNum = devicePageMap.get(idx) ?? '—';
    doc.text(truncated, MARGIN, y);
    doc.text(`Page ${pageNum}`, PAGE_WIDTH - MARGIN, y, { align: 'right' });
    y += 7;
  });

  // Disclaimer
  y += 3;
  doc.text('Limitations & Disclaimer', MARGIN, y);
  // Page number will be filled after we know it
}

function addExecutiveSummary(doc: jsPDF, report: ReportData): void {
  doc.addPage();
  let y = MARGIN;

  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text('Executive Summary', MARGIN, y + 8);
  y += 20;

  const totalDevices = report.devices.length;
  const completeDevices = report.devices.filter((d) => d.status === 'complete').length;
  const failedDevices = report.devices.filter((d) => d.status === 'failed').length;
  const skippedDevices = report.devices.filter((d) => d.status === 'skipped').length;
  const totalIssues = report.devices.reduce((sum, d) => sum + d.issues.filter((i) => i.severity === 'issue').length, 0);
  const totalObservations = report.devices.reduce(
    (sum, d) => sum + d.issues.filter((i) => i.severity === 'observation').length,
    0,
  );

  doc.setFontSize(11);
  doc.setTextColor(50, 50, 50);

  const summaryLines = [
    `URL: ${report.url}`,
    `Total devices: ${totalDevices}`,
    `Completed: ${completeDevices}`,
    `Failed: ${failedDevices}`,
    `Skipped: ${skippedDevices}`,
    '',
    `Issues found: ${totalIssues}`,
    `Observations: ${totalObservations}`,
  ];

  for (const line of summaryLines) {
    doc.text(line, MARGIN, y);
    y += 7;
  }
}

async function addDevicePage(
  doc: jsPDF,
  entry: DeviceReportEntry,
  _deviceIndex: number,
  useJpegFallback: boolean,
): Promise<void> {
  doc.addPage();
  let y = MARGIN;

  // Device header
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  const label = getDeviceLabel(entry);
  doc.text(label, MARGIN, y + 6);
  y += 14;

  // Status badge
  doc.setFontSize(10);
  if (entry.status === 'complete') {
    doc.setTextColor(30, 130, 50);
    doc.text('Status: Complete', MARGIN, y);
  } else if (entry.status === 'failed') {
    doc.setTextColor(200, 50, 50);
    doc.text(`Status: Failed — ${entry.error ?? 'Unknown error'}`, MARGIN, y);
  } else {
    doc.setTextColor(150, 150, 50);
    doc.text(`Status: Skipped — ${entry.error ?? 'Skipped'}`, MARGIN, y);
  }
  y += 10;

  // Annotated screenshot
  const screenshotBlob = entry.screenshotAnnotated ?? entry.screenshot;
  if (screenshotBlob) {
    try {
      let imgData = await blobToBase64(screenshotBlob);
      let imgFormat: 'PNG' | 'JPEG' = 'PNG';

      if (useJpegFallback && screenshotBlob.type !== 'image/jpeg') {
        // Convert to JPEG for size reduction
        const converted = await convertToJpeg(screenshotBlob);
        imgData = await blobToBase64(converted);
        imgFormat = 'JPEG';
      }

      // Calculate image dimensions to fit within content width
      const maxImgWidth = CONTENT_WIDTH;
      const maxImgHeight = 120; // mm — leave room for metrics and issues

      // Check if we need a new page for the image
      y = addNewPageIfNeeded(doc, y, maxImgHeight + 10);

      doc.addImage(imgData, imgFormat, MARGIN, y, maxImgWidth, maxImgHeight);
      y += maxImgHeight + 5;
    } catch {
      doc.setFontSize(9);
      doc.setTextColor(150, 50, 50);
      doc.text('Screenshot could not be embedded.', MARGIN, y);
      y += 7;
    }
  } else {
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 130);
    doc.text('No screenshot available.', MARGIN, y);
    y += 7;
  }

  // Performance metrics table
  if (entry.metrics) {
    y = addNewPageIfNeeded(doc, y, 55);
    y = addMetricsTable(doc, entry.metrics, y);
  }

  // Issues list
  if (entry.issues.length > 0) {
    y = addNewPageIfNeeded(doc, y, 10 + entry.issues.length * 6);
    y = addIssuesList(doc, entry.issues, y);
  }
}

function addMetricsTable(doc: jsPDF, metrics: PerformanceMetrics, startY: number): number {
  let y = startY;

  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('Performance Metrics', MARGIN, y);
  y += 7;

  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);

  const rows: [string, string][] = [
    ['Load Time', formatMetricForPDF(metrics.loadTimeMs, 'ms')],
    ['First Contentful Paint', formatMetricForPDF(metrics.fcpMs, 'ms')],
    ['Largest Contentful Paint', formatMetricForPDF(metrics.lcpMs, 'ms')],
    ['Cumulative Layout Shift', formatMetricForPDF(metrics.cls, 'score')],
    ['Resource Count', formatMetricForPDF(metrics.resourceCount, 'count')],
    ['Transfer Size', formatMetricForPDF(metrics.transferSizeKB, 'KB')],
    ['Cache Mode', metrics.cacheMode],
    ['Service Worker', metrics.serviceWorkerActive ? 'Active' : 'Inactive'],
  ];

  for (const [label, value] of rows) {
    y = addNewPageIfNeeded(doc, y, 6);
    doc.setTextColor(80, 80, 80);
    doc.text(label, MARGIN + 2, y);
    doc.setTextColor(30, 30, 30);
    doc.text(value, MARGIN + 80, y);
    y += 6;
  }

  return y + 3;
}

function addIssuesList(doc: jsPDF, issues: DetectedIssue[], startY: number): number {
  let y = startY;

  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(`Issues (${issues.length})`, MARGIN, y);
  y += 7;

  doc.setFontSize(9);

  for (const issue of issues) {
    y = addNewPageIfNeeded(doc, y, 12);

    // Severity indicator
    if (issue.severity === 'issue') {
      doc.setTextColor(200, 50, 50);
      doc.text('●', MARGIN + 2, y);
    } else {
      doc.setTextColor(200, 170, 50);
      doc.text('●', MARGIN + 2, y);
    }

    // Issue type and description
    doc.setTextColor(50, 50, 50);
    const issueText = `${issue.type.replace(/_/g, ' ')} — ${issue.description}`;
    const lines = doc.splitTextToSize(issueText, CONTENT_WIDTH - 10);
    doc.text(lines, MARGIN + 7, y);
    y += lines.length * 5 + 2;
  }

  return y + 3;
}

async function convertToJpeg(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
}

function addDisclaimer(doc: jsPDF): void {
  doc.addPage();
  let y = MARGIN;

  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text('Limitations & Disclaimer', MARGIN, y + 8);
  y += 20;

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);

  const disclaimerText = [
    'Browser Simulation Limitations:',
    'Screenetic uses user-agent string spoofing and viewport resizing to simulate mobile devices.',
    'It does not replicate the native rendering engine of the simulated browser (e.g., WebKit vs Blink).',
    'Rendering differences caused by engine-specific behavior may not be reflected in this report.',
    '',
    'Heuristic-Based Detection:',
    'All issues detected in this report are identified using heuristic analysis.',
    'These findings should be verified manually. False positives are possible by design.',
    '',
    'Performance Metrics:',
    'All performance metrics are measured within the host browser environment and labeled as "Simulated".',
    'Values may vary from real-device measurements due to differences in CPU, memory, network,',
    'and rendering engine. Metrics are comparable within a single report run but not across separate runs.',
    '',
    'Screenshots:',
    'Screenshots are captured using html2canvas and may not perfectly represent the actual device rendering.',
    'CSS features not supported by html2canvas may appear differently in screenshots.',
  ];

  for (const line of disclaimerText) {
    y = addNewPageIfNeeded(doc, y, 6);
    if (line.endsWith(':') && line.length < 40) {
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
    } else {
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
    }
    doc.text(line, MARGIN, y);
    y += line === '' ? 4 : 6;
  }
}

// ===== Main generate function =====

/**
 * Generates a PDF report from the given ReportData.
 * Returns a Blob containing the PDF.
 *
 * - A4 portrait, 15mm margins
 * - Structure: title page → TOC → executive summary → per-device pages → disclaimer
 * - No cross-page splits for screenshots/tables
 * - Embedded images as base64
 * - Page numbers: "Page X of Y"
 * - Max 100MB; JPEG 70% fallback if exceeded
 */
export async function generate(report: ReportData): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Use helvetica (built-in sans-serif)
  doc.setFont('helvetica');

  // Track which page each device starts on
  const devicePageMap = new Map<number, number>();

  // === Pass 1: Build the PDF ===

  // Page 1: Title page
  addTitlePage(doc, report);

  // Page 2: TOC (placeholder — we'll update page numbers after)
  addTableOfContents(doc, report, devicePageMap);

  // Page 3: Executive summary
  addExecutiveSummary(doc, report);

  // Per-device pages
  for (let i = 0; i < report.devices.length; i++) {
    const pageBeforeDevice = doc.getNumberOfPages();
    await addDevicePage(doc, report.devices[i], i, false);
    devicePageMap.set(i, pageBeforeDevice + 1);
  }

  // Disclaimer page
  addDisclaimer(doc);

  // Add page numbers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  // === Check size and apply JPEG fallback if needed ===
  let output = doc.output('blob');

  if (output.size > MAX_PDF_SIZE) {
    // Rebuild with JPEG fallback
    const fallbackDoc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    fallbackDoc.setFont('helvetica');

    const fallbackDevicePageMap = new Map<number, number>();

    addTitlePage(fallbackDoc, report);
    addTableOfContents(fallbackDoc, report, fallbackDevicePageMap);
    addExecutiveSummary(fallbackDoc, report);

    for (let i = 0; i < report.devices.length; i++) {
      const pageBeforeDevice = fallbackDoc.getNumberOfPages();
      await addDevicePage(fallbackDoc, report.devices[i], i, true);
      fallbackDevicePageMap.set(i, pageBeforeDevice + 1);
    }

    addDisclaimer(fallbackDoc);

    const fallbackTotalPages = fallbackDoc.getNumberOfPages();
    for (let i = 1; i <= fallbackTotalPages; i++) {
      fallbackDoc.setPage(i);
      addFooter(fallbackDoc, i, fallbackTotalPages);
    }

    output = fallbackDoc.output('blob');

    // If still over 100MB, add a note but return what we have
    if (output.size > MAX_PDF_SIZE) {
      console.warn(
        `PDF size (${(output.size / 1024 / 1024).toFixed(1)}MB) exceeds 100MB limit even with JPEG fallback.`,
      );
    }
  }

  return output;
}
