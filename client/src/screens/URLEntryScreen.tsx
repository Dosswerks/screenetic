import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getTermsAccepted } from '../services/sessionStore';
import { saveSession } from '../services/sessionStore';
import { TermsModal } from '../components/TermsModal';

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function URLEntryScreen() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(getTermsAccepted());
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const handleSubmit = useCallback((mode: 'side-by-side' | 'report') => {
    if (!termsAccepted) return;
    const trimmed = url.trim();
    if (!trimmed) { setError('Please enter a URL.'); return; }
    if (!isValidUrl(trimmed)) { setError('Please enter a valid URL (e.g., https://example.com).'); return; }
    setError('');
    saveSession({ url: trimmed, mode });
    navigate(mode === 'side-by-side' ? `/compare?url=${encodeURIComponent(trimmed)}` : `/report?url=${encodeURIComponent(trimmed)}`);
  }, [url, termsAccepted, navigate]);

  return (
    <div className="url-entry-screen">
      <TermsModal onAccept={() => setTermsAccepted(true)} />

      <div className="url-entry-card">
        <h1>What URL do you want to test?</h1>
        <p className="url-entry-subtitle">Enter a URL to compare across devices or generate a compatibility report.</p>

        <div className="url-input-row">
          <input
            type="url"
            className="input url-input"
            placeholder="https://example.com"
            value={url}
            onChange={e => { setUrl(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit('report'); }}
            disabled={!termsAccepted}
            aria-label="URL to test"
            autoFocus
          />
        </div>
        {error && <p className="url-error" role="alert">{error}</p>}
        {!termsAccepted && <p className="url-hint">Please accept the Terms of Use to continue.</p>}

        <div className="mode-buttons">
          {!isMobile && (
            <button className="btn mode-btn" onClick={() => handleSubmit('side-by-side')} disabled={!termsAccepted}>
              <span className="mode-icon">⬜⬜</span>
              <span>Side-by-Side Comparison</span>
              <span className="mode-desc">Compare two devices visually</span>
            </button>
          )}
          <button className="btn mode-btn btn-primary" onClick={() => handleSubmit('report')} disabled={!termsAccepted}>
            <span className="mode-icon">📊</span>
            <span>Run a Report</span>
            <span className="mode-desc">Audit across multiple devices</span>
          </button>
        </div>
      </div>
    </div>
  );
}
