// ===== Device Database =====

export interface DeviceDatabase {
  version: string;
  lastUpdated: string;
  sources: string[];
  autoAuditBaseline: string[];
  devices: DeviceEntry[];
}

export interface DeviceEntry {
  id: string;
  manufacturer: string;
  model: string;
  releaseYear: number | null;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  defaultBrowser: string;
  category: 'phone' | 'tablet' | 'desktop';
}

// ===== Viewport =====

export interface DeviceConfig {
  id: string;
  name: string;
  manufacturer: string;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  category: 'phone' | 'tablet' | 'desktop';
  defaultBrowser: string;
  releaseYear: number;
}

export interface ViewportError {
  type: 'load-failed' | 'timeout' | 'x-frame-options' | 'csp-blocked' | 'network-error' | 'unknown';
  message: string;
  details?: string;
}

// ===== Device Selector =====

export interface DeviceSelectorState {
  deviceId: string | null;
  width: number;
  height: number;
  dpr: number;
  browser: string;
  orientation: 'portrait' | 'landscape';
}

export interface BrowserConfig {
  name: string;
  userAgent: string;
  isNative: boolean;
}

// ===== Performance Metrics =====

export interface PerformanceMetrics {
  loadTimeMs: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  cls: number | null;
  resourceCount: number | null;
  transferSizeKB: number | null;
  cacheMode: 'cold' | 'warm';
  serviceWorkerActive: boolean;
  label: 'Simulated';
}

// ===== Issue Detection =====

export type IssueType =
  | 'horizontal_overflow'
  | 'viewport_clipping'
  | 'fixed_element_occlusion'
  | 'cls_above_threshold'
  | 'tap_target_too_small'
  | 'text_too_small'
  | 'missing_viewport_meta'
  | 'unresponsive_layout';

export interface DetectedIssue {
  type: IssueType;
  severity: 'issue' | 'observation';
  description: string;
  location: { x: number; y: number; width: number; height: number } | null;
  details: Record<string, unknown>;
}

// ===== Screenshots =====

export interface ScreenshotConfig {
  deviceName: string;
  width: number;
  height: number;
  dpr: number;
  orientation: 'portrait' | 'landscape';
  browser: string;
  url: string;
}

export interface ScreenshotResult {
  blob: Blob;
  filename: string;
  format: 'png' | 'jpeg';
}

// ===== Render Queue =====

export interface QueuedDevice {
  config: DeviceSelectorState;
  status: 'queued' | 'loading' | 'settling' | 'capturing' | 'analyzing' | 'complete' | 'failed' | 'skipped';
  result: DeviceResult | null;
  error: string | null;
  retryCount: number;
}

export interface DeviceResult {
  screenshotBlob: Blob;
  screenshotAnnotatedBlob: Blob;
  metrics: PerformanceMetrics;
  issues: DetectedIssue[];
  renderTimeMs: number;
}

export interface QueueProgress {
  completed: number;
  total: number;
  currentDevice: string;
  currentStage: string;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
}

// ===== Reports =====

export interface ReportData {
  url: string;
  generatedAt: string;
  deviceDatabaseVersion: string;
  screenenticVersion: string;
  devices: DeviceReportEntry[];
  isAutoAudit: boolean;
  autoAuditMethodology?: string;
  networkProfile?: string;
  cpuProfile?: string;
}

export interface DeviceReportEntry {
  config: DeviceSelectorState;
  screenshot: Blob | null;
  screenshotAnnotated: Blob | null;
  metrics: PerformanceMetrics | null;
  issues: DetectedIssue[];
  status: 'complete' | 'failed' | 'skipped';
  error?: string;
}

// ===== Session =====

export interface SessionState {
  url: string;
  mode: 'side-by-side' | 'report';
  leftViewport?: DeviceSelectorState;
  rightViewport?: DeviceSelectorState;
  reportDevices?: DeviceSelectorState[];
  termsAcceptedAt: string | null;
  savedAt: string;
}

// ===== Report Comparison =====

export interface ReportComparison {
  reportA: { id: string; createdAt: string };
  reportB: { id: string; createdAt: string };
  url: string;
  deviceComparisons: DeviceComparison[];
  summary: { improved: number; regressed: number; unchanged: number; addedDevices: number; removedDevices: number };
}

export interface DeviceComparison {
  deviceId: string;
  deviceName: string;
  verdict: 'improved' | 'regressed' | 'unchanged' | 'added' | 'removed';
  issueCountA: number;
  issueCountB: number;
  issueDelta: number;
  metricDeltas: MetricDelta[];
}

export interface MetricDelta {
  metric: string;
  valueA: number | null;
  valueB: number | null;
  delta: number | null;
  direction: 'improved' | 'regressed' | 'unchanged' | 'unavailable';
}

// ===== Network Throttling =====

export interface ThrottleProfile {
  name: string;
  downloadKbps: number;
  uploadKbps: number;
  latencyMs: number;
}

export const THROTTLE_PROFILES: Record<string, ThrottleProfile> = {
  '3g': { name: '3G', downloadKbps: 750, uploadKbps: 250, latencyMs: 100 },
  '4g': { name: '4G', downloadKbps: 4000, uploadKbps: 3000, latencyMs: 20 },
  '5g': { name: '5G', downloadKbps: 20000, uploadKbps: 10000, latencyMs: 5 },
  'slow-3g': { name: 'Slow 3G', downloadKbps: 400, uploadKbps: 150, latencyMs: 200 },
  'offline': { name: 'Offline', downloadKbps: 0, uploadKbps: 0, latencyMs: Infinity },
};

export interface CPUThrottleProfile {
  name: string;
  multiplier: number;
}

export const CPU_PROFILES: Record<string, CPUThrottleProfile> = {
  'high-end': { name: 'High-end device', multiplier: 1 },
  'mid-range': { name: 'Mid-range device', multiplier: 2 },
  'low-end': { name: 'Low-end device', multiplier: 4 },
};
