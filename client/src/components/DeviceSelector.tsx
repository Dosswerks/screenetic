import { useState, useMemo, useCallback } from 'react';
import { useDevices } from '../contexts/DeviceContext';
import type { DeviceSelectorState, DeviceEntry } from '@shared/types';

interface DeviceSelectorProps {
  value: DeviceSelectorState;
  onChange: (state: DeviceSelectorState) => void;
  label?: string;
}

const BROWSERS = ['Safari', 'Chrome', 'Firefox', 'Samsung Internet', 'Default'];

export function DeviceSelector({ value, onChange, label }: DeviceSelectorProps) {
  const { phones, tablets, desktops, devices } = useDevices();
  const [search, _setSearch] = useState(''); // TODO: wire up search input in Phase 2
  const [showCustom, setShowCustom] = useState(false);

  const filteredDevices = useMemo(() => {
    if (!search) return null;
    const q = search.toLowerCase();
    return devices.filter(d => d.model.toLowerCase().includes(q) || d.manufacturer.toLowerCase().includes(q));
  }, [search, devices]);

  const handleDeviceChange = useCallback((deviceId: string) => {
    if (deviceId === 'custom') {
      setShowCustom(true);
      onChange({ ...value, deviceId: null });
      return;
    }
    setShowCustom(false);
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;
    const isLandscape = value.orientation === 'landscape';
    onChange({
      deviceId: device.id,
      width: isLandscape ? device.cssHeight : device.cssWidth,
      height: isLandscape ? device.cssWidth : device.cssHeight,
      dpr: device.dpr,
      browser: device.defaultBrowser,
      orientation: value.orientation,
    });
  }, [devices, value, onChange]);

  const handleOrientationToggle = useCallback(() => {
    const newOrientation = value.orientation === 'portrait' ? 'landscape' : 'portrait';
    onChange({
      ...value,
      width: value.height,
      height: value.width,
      orientation: newOrientation,
    });
  }, [value, onChange]);

  const renderGroup = (label: string, items: DeviceEntry[]) => (
    <optgroup label={label} key={label}>
      {items.map(d => (
        <option key={d.id} value={d.id}>{d.manufacturer} {d.model} ({d.cssWidth}×{d.cssHeight})</option>
      ))}
    </optgroup>
  );

  return (
    <div className="device-selector" role="group" aria-label={label || 'Device configuration'}>
      {/* Device model */}
      <label className="ds-label">
        Device
        <select
          className="input ds-select"
          value={value.deviceId || 'custom'}
          onChange={e => handleDeviceChange(e.target.value)}
          aria-label="Device model"
        >
          {renderGroup('Phones', filteredDevices || phones)}
          {renderGroup('Tablets', filteredDevices || tablets)}
          {renderGroup('Desktops', filteredDevices || desktops)}
          <option value="custom">Custom Resolution</option>
        </select>
      </label>

      {/* Resolution (custom or override) */}
      {showCustom && (
        <div className="ds-custom-res">
          <label className="ds-label">
            Width
            <input type="number" className="input ds-num" min={320} max={7680}
              value={value.width} onChange={e => onChange({ ...value, width: parseInt(e.target.value) || 320 })} />
          </label>
          <span className="ds-x">×</span>
          <label className="ds-label">
            Height
            <input type="number" className="input ds-num" min={480} max={4320}
              value={value.height} onChange={e => onChange({ ...value, height: parseInt(e.target.value) || 480 })} />
          </label>
          <label className="ds-label">
            DPR
            <input type="number" className="input ds-num" min={1} max={4} step={0.5}
              value={value.dpr} onChange={e => onChange({ ...value, dpr: parseFloat(e.target.value) || 1 })} />
          </label>
        </div>
      )}

      {/* Browser */}
      <label className="ds-label">
        Browser
        <select className="input ds-select" value={value.browser}
          onChange={e => onChange({ ...value, browser: e.target.value })} aria-label="Browser">
          {BROWSERS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>

      {/* Orientation */}
      <button className="btn ds-orientation" onClick={handleOrientationToggle}
        aria-label={`Orientation: ${value.orientation}. Click to toggle.`}
        aria-pressed={value.orientation === 'landscape'}>
        {value.orientation === 'portrait' ? '📱 Portrait' : '📱 Landscape'}
      </button>

      {/* Summary */}
      <div className="ds-summary">
        {value.width}×{value.height} @{value.dpr}x — {value.browser}
        {value.browser === 'Chrome' ? '' : ' (UA simulation)'}
      </div>
    </div>
  );
}

export const DEFAULT_DEVICE_STATE: DeviceSelectorState = {
  deviceId: 'iphone-15',
  width: 393,
  height: 852,
  dpr: 3,
  browser: 'Safari',
  orientation: 'portrait',
};
