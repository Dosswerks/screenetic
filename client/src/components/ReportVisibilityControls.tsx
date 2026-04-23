import { useState, useCallback } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

// ===== Types =====

export interface ReportVisibilityControlsProps {
  reportId: string;
  currentVisibility: 'private' | 'unlisted';
  shareToken: string | null;
  shareExpiresAt: string | null;
  onVisibilityChange: (visibility: 'private' | 'unlisted') => void;
  onShareCreated: (shareUrl: string, token: string) => void;
  onShareRevoked: () => void;
}

type ExpiryOption = '1h' | '24h' | '7d' | '30d';

const EXPIRY_LABELS: Record<ExpiryOption, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

// ===== Component =====

export function ReportVisibilityControls({
  reportId,
  currentVisibility,
  shareToken,
  shareExpiresAt,
  onVisibilityChange,
  onShareCreated,
  onShareRevoked,
}: ReportVisibilityControlsProps) {
  const [loading, setLoading] = useState(false);
  const [selectedExpiry, setSelectedExpiry] = useState<ExpiryOption>('24h');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [dialog, setDialog] = useState<'visibility' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shareUrl = shareToken
    ? `${window.location.origin}/report/${reportId}?token=${shareToken}`
    : null;

  // --- Visibility toggle ---

  const handleVisibilityToggle = useCallback(() => {
    const next = currentVisibility === 'private' ? 'unlisted' : 'private';
    if (next === 'unlisted') {
      setDialog('visibility');
    } else {
      patchVisibility(next);
    }
  }, [currentVisibility]);

  const confirmVisibilityChange = useCallback(() => {
    setDialog(null);
    patchVisibility('unlisted');
  }, []);

  async function patchVisibility(visibility: 'private' | 'unlisted') {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ visibility }),
      });
      if (!res.ok) throw new Error('Failed to update visibility');
      onVisibilityChange(visibility);
    } catch {
      setError('Could not update visibility. Try again.');
    } finally {
      setLoading(false);
    }
  }

  // --- Share link generation ---

  const handleGenerateShare = useCallback(() => {
    setDialog('share');
  }, []);

  const confirmGenerateShare = useCallback(async () => {
    setDialog(null);
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/reports/${reportId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ expiresIn: selectedExpiry }),
      });
      if (!res.ok) throw new Error('Failed to generate share link');
      const data = await res.json();
      onShareCreated(data.shareUrl, data.shareToken);
    } catch {
      setError('Could not generate share link. Try again.');
    } finally {
      setLoading(false);
    }
  }, [reportId, selectedExpiry, onShareCreated]);

  // --- Revoke share link ---

  const handleRevoke = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/reports/${reportId}/share`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error('Failed to revoke link');
      onShareRevoked();
    } catch {
      setError('Could not revoke link. Try again.');
    } finally {
      setLoading(false);
    }
  }, [reportId, onShareRevoked]);

  // --- Copy share URL ---

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [shareUrl]);

  // --- Expiry display ---

  function formatExpiry(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    if (d <= now) return 'Expired';
    const diffMs = d.getTime() - now.getTime();
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `Expires in ${days}d ${hours % 24}h`;
    if (hours > 0) return `Expires in ${hours}h`;
    return 'Expires in <1h';
  }

  return (
    <div className="rvc" aria-label="Report visibility controls">
      {/* Visibility toggle */}
      <div className="rvc-section">
        <div className="rvc-row">
          <span className="rvc-label">Visibility</span>
          <button
            className={`btn rvc-toggle ${currentVisibility === 'unlisted' ? 'rvc-toggle--unlisted' : 'rvc-toggle--private'}`}
            onClick={handleVisibilityToggle}
            disabled={loading}
            aria-pressed={currentVisibility === 'unlisted'}
            aria-label={`Visibility: ${currentVisibility}. Click to change.`}
          >
            {currentVisibility === 'private' ? '🔒 Private' : '🔗 Unlisted'}
          </button>
        </div>
        <p className="rvc-hint">
          {currentVisibility === 'private'
            ? 'Only you can access this report.'
            : 'Anyone with the URL can view this report.'}
        </p>
      </div>

      {/* Share link section */}
      <div className="rvc-section">
        <span className="rvc-label">Share Link</span>
        {shareToken && shareUrl ? (
          <div className="rvc-share-active">
            <div className="rvc-share-url-row">
              <input
                className="input rvc-share-url"
                type="text"
                value={shareUrl}
                readOnly
                aria-label="Share URL"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                className="btn rvc-copy-btn"
                onClick={handleCopy}
                disabled={loading}
                aria-label="Copy share URL"
              >
                {copyFeedback ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            {shareExpiresAt && (
              <p className="rvc-expiry">{formatExpiry(shareExpiresAt)}</p>
            )}
            <button
              className="btn btn-danger rvc-revoke-btn"
              onClick={handleRevoke}
              disabled={loading}
              aria-label="Revoke share link"
            >
              {loading ? 'Revoking…' : 'Revoke Link'}
            </button>
          </div>
        ) : (
          <div className="rvc-share-generate">
            <div className="rvc-expiry-row">
              <label className="rvc-expiry-label" htmlFor="rvc-expiry-select">
                Link expires after
              </label>
              <select
                id="rvc-expiry-select"
                className="input rvc-expiry-select"
                value={selectedExpiry}
                onChange={(e) => setSelectedExpiry(e.target.value as ExpiryOption)}
                disabled={loading}
              >
                {(Object.keys(EXPIRY_LABELS) as ExpiryOption[]).map((key) => (
                  <option key={key} value={key}>
                    {EXPIRY_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-primary rvc-generate-btn"
              onClick={handleGenerateShare}
              disabled={loading}
              aria-label="Generate share link"
            >
              {loading ? 'Generating…' : 'Generate Share Link'}
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="rvc-error" role="alert">{error}</p>
      )}

      {/* Privacy warning: visibility change to unlisted */}
      {dialog === 'visibility' && (
        <VisibilityDialog
          onCancel={() => setDialog(null)}
          onConfirm={confirmVisibilityChange}
        />
      )}

      {/* Privacy warning: share link generation */}
      {dialog === 'share' && (
        <ShareDialog
          expiryLabel={EXPIRY_LABELS[selectedExpiry]}
          onCancel={() => setDialog(null)}
          onConfirm={confirmGenerateShare}
        />
      )}
    </div>
  );
}

// --- Focus-trapped dialog sub-components ---

function VisibilityDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const trapRef = useFocusTrap({ onEscape: onCancel });
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Privacy warning">
      <div className="modal-content" ref={trapRef}>
        <h2>Change to Unlisted?</h2>
        <div className="modal-body">
          <p>Unlisted reports can be accessed by anyone with the URL. The report will not appear in public listings, but the link is shareable.</p>
        </div>
        <div className="rvc-dialog-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm}>Make Unlisted</button>
        </div>
      </div>
    </div>
  );
}

function ShareDialog({ expiryLabel, onCancel, onConfirm }: { expiryLabel: string; onCancel: () => void; onConfirm: () => void }) {
  const trapRef = useFocusTrap({ onEscape: onCancel });
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Share privacy warning">
      <div className="modal-content" ref={trapRef}>
        <h2>Generate Share Link?</h2>
        <div className="modal-body">
          <p>This will make the report accessible to anyone with the link. Screenshots may contain sensitive content.</p>
          <p>The link will expire after <strong>{expiryLabel}</strong>. You can revoke it at any time.</p>
        </div>
        <div className="rvc-dialog-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm}>Generate Link</button>
        </div>
      </div>
    </div>
  );
}
