import { useState } from 'react';
import { getTermsAccepted, acceptTerms } from '../services/sessionStore';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface TermsModalProps {
  onAccept: () => void;
}

export function TermsModal({ onAccept }: TermsModalProps) {
  const [visible, setVisible] = useState(!getTermsAccepted());

  const handleAccept = () => {
    acceptTerms();
    setVisible(false);
    onAccept();
  };

  const trapRef = useFocusTrap();

  if (!visible) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className="modal-content" ref={trapRef}>
        <h2 id="terms-title">Terms of Use</h2>
        <div className="modal-body">
          <p>By using Screenetic, you agree to the following:</p>
          <ul>
            <li>You are responsible for ensuring you have authorization to test any URL you submit.</li>
            <li>Screenetic provides simulation-based results, not authoritative device testing.</li>
            <li>Results should not be treated as a guarantee of real-device behavior.</li>
            <li>Screenetic is not responsible for content rendered within viewports.</li>
            <li>All rendering occurs locally in your browser. No tested content is transmitted to third parties.</li>
            <li>Stored reports are encrypted at rest.</li>
          </ul>
          <p><a href="/terms" target="_blank" rel="noopener">Read full Terms of Use</a></p>
        </div>
        <button className="btn btn-primary" onClick={handleAccept}>
          I Accept
        </button>
      </div>
    </div>
  );
}
