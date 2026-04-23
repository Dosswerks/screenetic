import type { ViewportError } from '@shared/types';

interface ViewportErrorDisplayProps {
  error: ViewportError;
  width: number;
  height: number;
  zoom: number;
}

const WORKAROUND_SUGGESTIONS: Record<string, { text: string; helpUrl?: string }[]> = {
  'x-frame-options': [
    {
      text: 'Use a browser extension that strips X-Frame-Options headers for testing (e.g., "Ignore X-Frame headers").',
      helpUrl: '/help#iframe-blocking-extensions',
    },
    {
      text: 'Use browser DevTools device emulation mode as an alternative.',
      helpUrl: '/help#devtools-emulation',
    },
    {
      text: 'Run Screenetic against a staging or development environment where iframe restrictions may not be enforced.',
      helpUrl: '/help#staging-environments',
    },
  ],
  'csp-blocked': [
    {
      text: 'Use a browser extension that modifies CSP headers for testing (e.g., "Disable Content-Security-Policy").',
      helpUrl: '/help#iframe-blocking-extensions',
    },
    {
      text: 'Use browser DevTools device emulation mode as an alternative.',
      helpUrl: '/help#devtools-emulation',
    },
    {
      text: 'Run Screenetic against a staging or development environment where CSP restrictions may be relaxed.',
      helpUrl: '/help#staging-environments',
    },
  ],
  timeout: [
    {
      text: 'Check that the URL is accessible in your browser directly.',
    },
    {
      text: 'Try again — the site may have been temporarily slow.',
    },
  ],
  'network-error': [
    {
      text: 'Verify the URL is correct and the site is online.',
    },
    {
      text: 'Check your network connection.',
    },
  ],
};

const ERROR_ICONS: Record<ViewportError['type'], string> = {
  'x-frame-options': '🚫',
  'csp-blocked': '🛡️',
  timeout: '⏱️',
  'load-failed': '❌',
  'network-error': '🌐',
  unknown: '⚠️',
};

export function ViewportErrorDisplay({ error, width, height, zoom }: ViewportErrorDisplayProps) {
  const suggestions = WORKAROUND_SUGGESTIONS[error.type] ?? [];
  const icon = ERROR_ICONS[error.type] ?? '⚠️';

  return (
    <div
      className="viewport-error-display"
      role="alert"
      aria-live="assertive"
      style={{
        width: width * zoom,
        height: height * zoom,
      }}
    >
      <div className="viewport-error-content">
        <span className="viewport-error-icon" aria-hidden="true">{icon}</span>
        <h3 className="viewport-error-title">{error.message}</h3>
        {error.details && (
          <p className="viewport-error-details">{error.details}</p>
        )}
        {suggestions.length > 0 && (
          <div className="viewport-error-suggestions">
            <p className="viewport-error-suggestions-label">Workarounds:</p>
            <ul>
              {suggestions.map((s, i) => (
                <li key={i}>
                  {s.text}
                  {s.helpUrl && (
                    <>
                      {' '}
                      <a href={s.helpUrl} className="viewport-error-help-link">
                        Learn more
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
