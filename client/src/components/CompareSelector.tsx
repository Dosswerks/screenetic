import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QueuedDevice, DeviceSelectorState } from '@shared/types';

interface CompareSelectorProps {
  devices: QueuedDevice[];
  url: string;
  deviceDisplayName: (config: DeviceSelectorState) => string;
}

/**
 * Adds checkboxes to completed device result cards and a "Compare Selected" CTA.
 * When exactly 2 devices are checked, navigates to /compare with left/right query params.
 * Only rendered on desktop (parent handles the mobile gate).
 */
export function CompareSelector({ devices, url, deviceDisplayName }: CompareSelectorProps) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const completedDevices = devices
    .map((d, i) => ({ device: d, index: i }))
    .filter(({ device }) => device.status === 'complete');

  const handleToggle = useCallback((index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        // Max 2 selections
        if (next.size >= 2) return prev;
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleCompare = useCallback(() => {
    const indices = Array.from(selected);
    if (indices.length !== 2) return;

    const left = devices[indices[0]].config;
    const right = devices[indices[1]].config;

    const params = new URLSearchParams({
      url,
      left: JSON.stringify(left),
      right: JSON.stringify(right),
    });

    navigate(`/compare?${params.toString()}`);
  }, [selected, devices, url, navigate]);

  if (completedDevices.length < 2) return null;

  return (
    <div className="compare-selector" role="group" aria-label="Select devices to compare side by side">
      <h3 className="compare-selector-title">Compare Devices</h3>
      <p className="compare-selector-hint">
        Select 2 devices to open in Side-by-Side mode ({selected.size}/2 selected)
      </p>
      <ul className="compare-selector-list">
        {completedDevices.map(({ device, index }) => {
          const isChecked = selected.has(index);
          const isDisabled = !isChecked && selected.size >= 2;
          return (
            <li key={index} className="compare-selector-item">
              <label className={`compare-selector-label${isChecked ? ' compare-selector-label--checked' : ''}`}>
                <input
                  type="checkbox"
                  className="compare-selector-checkbox"
                  checked={isChecked}
                  disabled={isDisabled}
                  onChange={() => handleToggle(index)}
                  aria-label={`Select ${deviceDisplayName(device.config)} for comparison`}
                />
                <span className="compare-selector-name">{deviceDisplayName(device.config)}</span>
                <span className="compare-selector-config">
                  {device.config.width}×{device.config.height} @{device.config.dpr}x — {device.config.browser}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {selected.size === 2 && (
        <button
          className="btn btn-primary compare-selector-btn"
          onClick={handleCompare}
          aria-label="Compare selected devices in Side-by-Side mode"
        >
          Compare Selected
        </button>
      )}
    </div>
  );
}
