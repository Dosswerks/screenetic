import { useCallback } from 'react';
import type { DeviceSelectorState } from '@shared/types';

export interface SideBySideControlsProps {
  syncScroll: boolean;
  onSyncScrollChange: (enabled: boolean) => void;
  sharedZoom: number; // -1 = fit-to-screen, positive = zoom level
  onSharedZoomChange: (zoom: number) => void;
  onMirrorSettings: (direction: 'left-to-right' | 'right-to-left') => void;
  leftConfig: DeviceSelectorState;
  rightConfig: DeviceSelectorState;
  isCrossOrigin?: boolean;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.25;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export function SideBySideControls({
  syncScroll,
  onSyncScrollChange,
  sharedZoom,
  onSharedZoomChange,
  onMirrorSettings,
  isCrossOrigin = false,
}: SideBySideControlsProps) {
  const isFitMode = sharedZoom === -1;
  const displayZoom = isFitMode ? 'Fit' : `${Math.round(sharedZoom * 100)}%`;

  const handleSyncScrollToggle = useCallback(() => {
    onSyncScrollChange(!syncScroll);
  }, [syncScroll, onSyncScrollChange]);

  const handleZoomSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      onSharedZoomChange(val);
    },
    [onSharedZoomChange],
  );

  const handleFitToScreen = useCallback(() => {
    onSharedZoomChange(-1);
  }, [onSharedZoomChange]);

  const handleZoomIn = useCallback(() => {
    if (isFitMode) {
      onSharedZoomChange(ZOOM_STEPS[0]);
      return;
    }
    const next = Math.min(MAX_ZOOM, sharedZoom + ZOOM_STEP);
    onSharedZoomChange(next);
  }, [isFitMode, sharedZoom, onSharedZoomChange]);

  const handleZoomOut = useCallback(() => {
    if (isFitMode) return;
    const next = Math.max(MIN_ZOOM, sharedZoom - ZOOM_STEP);
    onSharedZoomChange(next);
  }, [isFitMode, sharedZoom, onSharedZoomChange]);

  return (
    <div
      className="sbs-controls"
      role="toolbar"
      aria-label="Side-by-side viewport controls"
    >
      {/* Sync Scroll */}
      <div className="sbs-controls-group">
        <button
          className={`btn sbs-sync-btn ${syncScroll ? 'sbs-sync-active' : ''}`}
          onClick={handleSyncScrollToggle}
          aria-pressed={syncScroll}
          aria-label="Sync Scroll"
          title={
            isCrossOrigin
              ? 'Sync scroll unavailable (cross-origin page)'
              : syncScroll
                ? 'Disable synchronized scrolling'
                : 'Enable synchronized scrolling'
          }
          disabled={isCrossOrigin}
        >
          🔗 Sync Scroll
        </button>
        {isCrossOrigin && (
          <span className="sbs-controls-hint" role="status">
            Sync scroll unavailable (cross-origin page)
          </span>
        )}
      </div>

      {/* Mirror Settings */}
      <div className="sbs-controls-group">
        <button
          className="btn sbs-mirror-btn"
          onClick={() => onMirrorSettings('left-to-right')}
          aria-label="Copy left device settings to right"
          title="Copy left device settings to right"
        >
          Copy Left → Right
        </button>
        <button
          className="btn sbs-mirror-btn"
          onClick={() => onMirrorSettings('right-to-left')}
          aria-label="Copy right device settings to left"
          title="Copy right device settings to left"
        >
          ← Copy Right to Left
        </button>
      </div>

      {/* Shared Zoom */}
      <div className="sbs-controls-group sbs-zoom-group">
        <span className="sbs-zoom-label">Shared Zoom:</span>
        <button
          className="btn sbs-zoom-btn"
          onClick={handleZoomOut}
          disabled={isFitMode || sharedZoom <= MIN_ZOOM}
          aria-label="Shared zoom out"
          title="Zoom out"
        >
          −
        </button>
        <input
          type="range"
          className="sbs-zoom-slider"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          value={isFitMode ? 1 : sharedZoom}
          onChange={handleZoomSliderChange}
          aria-label="Shared zoom level"
          aria-valuemin={MIN_ZOOM * 100}
          aria-valuemax={MAX_ZOOM * 100}
          aria-valuenow={isFitMode ? undefined : Math.round(sharedZoom * 100)}
          aria-valuetext={displayZoom}
        />
        <button
          className="btn sbs-zoom-btn"
          onClick={handleZoomIn}
          disabled={!isFitMode && sharedZoom >= MAX_ZOOM}
          aria-label="Shared zoom in"
          title="Zoom in"
        >
          +
        </button>
        <span className="sbs-zoom-value" aria-live="polite">
          {displayZoom}
        </span>
        <button
          className={`btn sbs-zoom-fit-btn ${isFitMode ? 'sbs-zoom-fit-active' : ''}`}
          onClick={handleFitToScreen}
          aria-pressed={isFitMode}
          aria-label="Fit to screen"
          title="Fit both viewports to screen"
        >
          Fit to screen
        </button>
      </div>
    </div>
  );
}
