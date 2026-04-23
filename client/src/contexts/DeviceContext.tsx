import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { DeviceDatabase, DeviceEntry } from '@shared/types';
import deviceDatabaseJson from '@shared/device-database.json';

interface DeviceContextType {
  database: DeviceDatabase | null;
  devices: DeviceEntry[];
  phones: DeviceEntry[];
  tablets: DeviceEntry[];
  desktops: DeviceEntry[];
  autoAuditBaseline: string[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const DeviceContext = createContext<DeviceContextType | null>(null);

const POLL_INTERVAL = 60 * 60 * 1000; // 60 minutes

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [database, setDatabase] = useState<DeviceDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const cachedETag = sessionStorage.getItem('deviceDB_etag');
      const headers: Record<string, string> = {};
      if (cachedETag) headers['If-None-Match'] = cachedETag;

      const res = await fetch('/api/devices', { headers });

      if (res.status === 304) {
        const cached = sessionStorage.getItem('deviceDB');
        if (cached) { setDatabase(JSON.parse(cached)); setLoading(false); return; }
      }

      if (!res.ok) throw new Error(`Failed to load devices: ${res.status}`);

      const data: DeviceDatabase = await res.json();
      sessionStorage.setItem('deviceDB', JSON.stringify(data));
      sessionStorage.setItem('deviceDB_etag', res.headers.get('ETag') || '');
      setDatabase(data);
      setError(null);
    } catch (err: any) {
      // Fallback to bundled device database when backend is unavailable
      const fallback = deviceDatabaseJson as unknown as DeviceDatabase;
      setDatabase(fallback);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    const interval = setInterval(loadDevices, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadDevices]);

  const devices = database?.devices || [];
  const phones = devices.filter(d => d.category === 'phone');
  const tablets = devices.filter(d => d.category === 'tablet');
  const desktops = devices.filter(d => d.category === 'desktop');

  return (
    <DeviceContext.Provider value={{
      database, devices, phones, tablets, desktops,
      autoAuditBaseline: database?.autoAuditBaseline || [],
      loading, error, reload: loadDevices,
    }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevices() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevices must be used within DeviceProvider');
  return ctx;
}
