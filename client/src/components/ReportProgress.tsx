import type { QueueProgress, QueuedDevice } from '@shared/types';

// ===== Props =====

export interface ReportProgressProps {
  progress: QueueProgress;
  devices: QueuedDevice[];
  onCancel: () => void;
}

// ===== Pure formatting helpers (exported for testing) =====

/** Format milliseconds as "Xm Ys" */
export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/** Calculate percentage (0–100), clamped */
export function calcPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

/** Human-readable stage label */
export function stageLabel(
  status: QueuedDevice['status'],
): string {
  switch (status) {
    case 'queued': return 'Queued';
    case 'loading': return 'Loading page';
    case 'settling': return 'Waiting for page settle';
    case 'capturing': return 'Capturing screenshot';
    case 'analyzing': return 'Collecting metrics';
    case 'complete': return 'Complete';
    case 'failed': return 'Failed';
    case 'skipped': return 'Skipped';
    default: return status;
  }
}

/** Status icon for a device */
export function statusIcon(status: QueuedDevice['status']): string {
  switch (status) {
    case 'queued': return '⏳';
    case 'loading':
    case 'settling':
    case 'capturing':
    case 'analyzing': return '🔄';
    case 'complete': return '✅';
    case 'failed': return '❌';
    case 'skipped': return '⏭️';
    default: return '⏳';
  }
}

/** Build a short display name from a device config */
function deviceName(device: QueuedDevice): string {
  const c = device.config;
  const w = c.orientation === 'landscape' ? c.height : c.width;
  const h = c.orientation === 'landscape' ? c.width : c.height;
  return c.deviceId ?? `Custom (${w}×${h})`;
}

// ===== Component =====

export function ReportProgress({ progress, devices, onCancel }: ReportProgressProps) {
  const percent = calcPercent(progress.completed, progress.total);

  return (
    <div className="rp" role="region" aria-label="Report generation progress">
      {/* Overall progress bar */}
      <div className="rp-bar-wrap">
        <div
          className="rp-bar"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${percent}% complete`}
        >
          <div className="rp-bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <span className="rp-bar-label">{percent}%</span>
      </div>

      {/* Summary line */}
      <p className="rp-summary">
        {progress.completed} of {progress.total} devices
      </p>

      {/* Current device and stage */}
      {progress.currentDevice && progress.currentStage && (
        <p className="rp-current" aria-live="polite">
          {progress.currentDevice} — {progress.currentStage}
        </p>
      )}

      {/* Timing */}
      <div className="rp-timing">
        <span>Elapsed: {formatTime(progress.elapsedMs)}</span>
        <span>
          {progress.estimatedRemainingMs != null
            ? `~${formatTime(progress.estimatedRemainingMs)} remaining`
            : progress.completed < 2
              ? 'Calculating...'
              : ''}
        </span>
      </div>

      {/* Per-device status list */}
      <ul className="rp-devices" aria-label="Device status list" aria-live="polite">
        {devices.map((d, i) => (
          <li key={i} className={`rp-device rp-device--${d.status}`}>
            <span className="rp-device-icon" aria-hidden="true">{statusIcon(d.status)}</span>
            <span className="rp-device-name">{deviceName(d)}</span>
            <span className="rp-device-stage">
              {d.status === 'loading' || d.status === 'settling' || d.status === 'capturing' || d.status === 'analyzing'
                ? stageLabel(d.status)
                : ''}
            </span>
            {d.status === 'failed' && d.error && (
              <span className="rp-device-error">{d.error}</span>
            )}
          </li>
        ))}
      </ul>

      {/* Cancel button */}
      <button className="btn btn-danger rp-cancel" onClick={onCancel} type="button">
        Cancel
      </button>
    </div>
  );
}
