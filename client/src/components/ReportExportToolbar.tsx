import { useState, useCallback } from 'react';
import type { ReportData, QueuedDevice, ScreenshotResult } from '@shared/types';
import { generate } from '../utils/PDFGenerator';
import { exportJSON, exportCSV } from '../utils/ReportExporter';
import { batchDownload, downloadBlob } from '../utils/ScreenshotCapture';
import { shareReport } from '../utils/MobileShare';

export interface ReportExportToolbarProps {
  report: ReportData;
  devices: QueuedDevice[];
  url: string;
  isMobile: boolean;
  reportId?: string;
}

type ExportAction = 'pdf' | 'json' | 'csv' | 'zip' | 'copy';

/** Build a URL slug from a URL string for use in filenames. */
function urlSlug(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/[^a-zA-Z0-9]/g, '-');
  } catch {
    return 'report';
  }
}

/** Format a date string for filenames: YYYYMMDD */
function dateSlug(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
}

export function ReportExportToolbar({ report, devices, url, isMobile, reportId }: ReportExportToolbarProps) {
  const [loading, setLoading] = useState<ExportAction | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handleDownloadPDF = useCallback(async () => {
    setLoading('pdf');
    try {
      const blob = await generate(report);
      downloadBlob(blob, `screenetic-report-${urlSlug(url)}-${dateSlug()}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setLoading(null);
    }
  }, [report, url]);

  const handleDownloadJSON = useCallback(() => {
    setLoading('json');
    try {
      const blob = exportJSON(report);
      downloadBlob(blob, `screenetic-report-${urlSlug(url)}-${dateSlug()}.json`);
    } finally {
      setLoading(null);
    }
  }, [report, url]);

  const handleDownloadCSV = useCallback(() => {
    setLoading('csv');
    try {
      const blob = exportCSV(report);
      downloadBlob(blob, `screenetic-report-${urlSlug(url)}-${dateSlug()}.csv`);
    } finally {
      setLoading(null);
    }
  }, [report, url]);

  const handleDownloadZIP = useCallback(async () => {
    setLoading('zip');
    try {
      const screenshots: ScreenshotResult[] = [];
      for (const device of devices) {
        if (device.status === 'complete' && device.result?.screenshotBlob) {
          const config = device.config;
          const sanitizedDevice = (config.deviceId ?? `${config.width}x${config.height}`).replace(/[^a-zA-Z0-9_-]/g, '_');
          screenshots.push({
            blob: device.result.screenshotBlob,
            filename: `${sanitizedDevice}_${config.width}x${config.height}_${config.orientation}.png`,
            format: 'png',
          });
        }
      }
      if (screenshots.length > 0) {
        const zipBlob = await batchDownload(screenshots);
        downloadBlob(zipBlob, `screenetic-screenshots-${urlSlug(url)}-${dateSlug()}.zip`);
      }
    } catch (err) {
      console.error('ZIP generation failed:', err);
    } finally {
      setLoading(null);
    }
  }, [devices, url]);

  const handleCopyLink = useCallback(async () => {
    if (!reportId) return;
    setLoading('copy');
    try {
      const shareUrl = `${window.location.origin}/report/${reportId}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
    } finally {
      setLoading(null);
    }
  }, [reportId]);

  const handleNativeShare = useCallback(async () => {
    if (!reportId) return;
    const shareUrl = `${window.location.origin}/report/${reportId}`;
    await shareReport({
      title: 'Screenetic Report',
      url: shareUrl,
      text: `Screenetic Report for ${url}`,
    });
  }, [reportId, url]);

  return (
    <div className="report-export-toolbar" role="toolbar" aria-label="Report export options">
      <button
        className="btn report-export-btn"
        onClick={handleDownloadPDF}
        disabled={loading !== null}
        aria-label="Download PDF"
      >
        {loading === 'pdf' ? 'Generating PDF…' : 'Download PDF'}
      </button>
      <button
        className="btn report-export-btn"
        onClick={handleDownloadJSON}
        disabled={loading !== null}
        aria-label="Download JSON"
      >
        {loading === 'json' ? 'Exporting…' : 'Download JSON'}
      </button>
      <button
        className="btn report-export-btn"
        onClick={handleDownloadCSV}
        disabled={loading !== null}
        aria-label="Download CSV"
      >
        {loading === 'csv' ? 'Exporting…' : 'Download CSV'}
      </button>
      <button
        className="btn report-export-btn"
        onClick={handleDownloadZIP}
        disabled={loading !== null}
        aria-label="Download Screenshots (ZIP)"
      >
        {loading === 'zip' ? 'Zipping…' : 'Download Screenshots (ZIP)'}
      </button>
      {reportId && (
        <button
          className="btn report-export-btn"
          onClick={handleCopyLink}
          disabled={loading !== null}
          aria-label="Copy Link"
        >
          {copyFeedback ? 'Copied!' : loading === 'copy' ? 'Copying…' : 'Copy Link'}
        </button>
      )}
      {isMobile && reportId && (
        <button
          className="btn report-export-btn"
          onClick={handleNativeShare}
          aria-label="Share"
        >
          Share
        </button>
      )}
    </div>
  );
}
