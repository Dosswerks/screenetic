import type { SessionState } from '@shared/types';

const SESSION_KEY = 'screenetic_session';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function saveSession(state: Partial<SessionState>): void {
  try {
    const existing = loadSession();
    const merged: SessionState = {
      url: '',
      mode: 'report',
      termsAcceptedAt: null,
      savedAt: new Date().toISOString(),
      ...existing,
      ...state,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(merged));
  } catch {
    // localStorage unavailable — silently fail
  }
}

export function loadSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const state: SessionState = JSON.parse(raw);
    // Check 24-hour expiry
    if (Date.now() - new Date(state.savedAt).getTime() > MAX_AGE_MS) {
      clearSession();
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // silently fail
  }
}

export function getTermsAccepted(): boolean {
  const session = loadSession();
  return !!session?.termsAcceptedAt;
}

export function acceptTerms(): void {
  saveSession({ termsAcceptedAt: new Date().toISOString() });
}
