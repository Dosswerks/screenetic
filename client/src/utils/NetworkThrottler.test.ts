import { describe, it, expect } from 'vitest';
import { calculateDelay } from './NetworkThrottler';
import { THROTTLE_PROFILES, type ThrottleProfile } from '@shared/types';

describe('NetworkThrottler — calculateDelay', () => {
  it('returns latency + transfer delay for a typical 3G response', () => {
    const profile = THROTTLE_PROFILES['3g']; // 750 Kbps, 100ms latency
    const sizeBytes = 100_000; // 100 KB

    // latency = 100ms
    // transfer = (100000 * 8) / (750 * 1000) * 1000 = 800000 / 750000 * 1000 ≈ 1066.67ms
    // total ≈ 1167ms
    const delay = calculateDelay(sizeBytes, profile);
    expect(delay).toBe(Math.round(100 + (100_000 * 8) / (750 * 1000) * 1000));
  });

  it('returns latency + transfer delay for 4G', () => {
    const profile = THROTTLE_PROFILES['4g']; // 4000 Kbps, 20ms latency
    const sizeBytes = 500_000; // 500 KB

    // latency = 20ms
    // transfer = (500000 * 8) / (4000 * 1000) * 1000 = 4000000 / 4000000 * 1000 = 1000ms
    // total = 1020ms
    const delay = calculateDelay(sizeBytes, profile);
    expect(delay).toBe(1020);
  });

  it('returns latency + transfer delay for 5G', () => {
    const profile = THROTTLE_PROFILES['5g']; // 20000 Kbps, 5ms latency
    const sizeBytes = 1_000_000; // 1 MB

    // latency = 5ms
    // transfer = (1000000 * 8) / (20000 * 1000) * 1000 = 8000000 / 20000000 * 1000 = 400ms
    // total = 405ms
    const delay = calculateDelay(sizeBytes, profile);
    expect(delay).toBe(405);
  });

  it('returns latency + transfer delay for Slow 3G', () => {
    const profile = THROTTLE_PROFILES['slow-3g']; // 400 Kbps, 200ms latency
    const sizeBytes = 50_000; // 50 KB

    // latency = 200ms
    // transfer = (50000 * 8) / (400 * 1000) * 1000 = 400000 / 400000 * 1000 = 1000ms
    // total = 1200ms
    const delay = calculateDelay(sizeBytes, profile);
    expect(delay).toBe(1200);
  });

  it('returns Infinity for offline profile', () => {
    const profile = THROTTLE_PROFILES['offline'];
    expect(calculateDelay(1000, profile)).toBe(Infinity);
  });

  it('returns Infinity when downloadKbps is 0', () => {
    const profile: ThrottleProfile = {
      name: 'Zero BW',
      downloadKbps: 0,
      uploadKbps: 100,
      latencyMs: 50,
    };
    expect(calculateDelay(1000, profile)).toBe(Infinity);
  });

  it('returns Infinity when latencyMs is Infinity', () => {
    const profile: ThrottleProfile = {
      name: 'Infinite Latency',
      downloadKbps: 1000,
      uploadKbps: 500,
      latencyMs: Infinity,
    };
    expect(calculateDelay(1000, profile)).toBe(Infinity);
  });

  it('returns just latency when response size is 0 bytes', () => {
    const profile = THROTTLE_PROFILES['3g'];
    const delay = calculateDelay(0, profile);
    expect(delay).toBe(profile.latencyMs);
  });

  it('returns just latency when response size is 0 for 5G', () => {
    const profile = THROTTLE_PROFILES['5g'];
    expect(calculateDelay(0, profile)).toBe(5);
  });

  it('returns an integer (rounded)', () => {
    const profile: ThrottleProfile = {
      name: 'Custom',
      downloadKbps: 333,
      uploadKbps: 100,
      latencyMs: 77,
    };
    const delay = calculateDelay(12345, profile);
    expect(Number.isInteger(delay)).toBe(true);
  });

  it('scales linearly with response size', () => {
    const profile = THROTTLE_PROFILES['4g'];
    const delay1 = calculateDelay(100_000, profile);
    const delay2 = calculateDelay(200_000, profile);

    // delay2 - latency should be roughly 2x (delay1 - latency)
    const transfer1 = delay1 - profile.latencyMs;
    const transfer2 = delay2 - profile.latencyMs;
    expect(transfer2).toBeCloseTo(transfer1 * 2, 0);
  });
});
