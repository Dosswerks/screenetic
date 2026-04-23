import { Link } from 'react-router-dom';

export function PrivacyScreen() {
  return (
    <div className="legal-screen">
      <article className="legal-content" aria-label="Privacy Policy">
        <h1>Privacy Policy</h1>
        <p className="legal-placeholder-notice">
          ⚠️ This is placeholder legal text for development purposes. It should be reviewed and
          replaced by qualified legal counsel before production use.
        </p>
        <p className="legal-effective">Effective Date: January 1, 2025</p>

        <h2>1. Data We Collect</h2>
        <p>Screenetic collects minimal data to provide the service:</p>
        <ul>
          <li>
            <strong>Account information</strong> (authenticated users only): email address and a
            hashed password. We do not store plaintext passwords.
          </li>
          <li>
            <strong>Report metadata</strong>: the URL you tested, device configurations selected,
            performance metrics, and detected issues.
          </li>
          <li>
            <strong>Screenshots</strong>: captured viewport images stored in encrypted object
            storage when you save a report.
          </li>
          <li>
            <strong>Server access logs</strong>: IP address, timestamp, and report ID accessed,
            retained for security monitoring.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> log or retain the rendered page content, DOM structure, or
          screenshot image data in server logs. Only the URL string and report metadata appear in
          logs.
        </p>

        <h2>2. How We Use Your Data</h2>
        <p>Your data is used solely to:</p>
        <ul>
          <li>Render and display device viewports in your browser</li>
          <li>Generate, store, and retrieve reports you create</li>
          <li>Authenticate your account and manage sessions</li>
          <li>Monitor for security issues and service abuse</li>
        </ul>
        <p>
          All page rendering happens client-side in your browser. Screenetic's server never sees or
          processes the content of the pages you test.
        </p>

        <h2>3. Storage and Retention</h2>
        <ul>
          <li>
            <strong>Anonymous reports</strong>: retained for 7 days, then permanently deleted.
          </li>
          <li>
            <strong>Authenticated reports</strong>: retained until you delete them or close your
            account.
          </li>
          <li>
            <strong>Server access logs</strong>: retained for 30 days, then automatically purged.
          </li>
          <li>
            <strong>Deleted data</strong>: when a report is deleted or expires, all associated data
            (metadata, screenshots) is permanently purged within 24 hours. No backup copies are
            retained beyond the purge window.
          </li>
        </ul>

        <h2>4. Cookies and Local Storage</h2>
        <p>Screenetic uses:</p>
        <ul>
          <li>
            <strong>Session cookies</strong>: to identify anonymous sessions and maintain
            authentication state.
          </li>
          <li>
            <strong>localStorage</strong>: to persist session state (URL, mode, device configs),
            Terms of Use acceptance, and user preferences.
          </li>
          <li>
            <strong>sessionStorage</strong>: to cache the device database for performance.
          </li>
          <li>
            <strong>IndexedDB</strong>: to store in-progress report data and screenshot blobs during
            report generation, enabling resume after interruption.
          </li>
        </ul>
        <p>We do not use third-party tracking cookies or analytics services.</p>

        <h2>5. Third-Party Services</h2>
        <p>
          Screenetic uses cloud infrastructure for hosting, database, and object storage. Screenshots
          are stored with AES-256 encryption at rest. We do not sell, share, or provide your data to
          third parties for advertising or marketing purposes.
        </p>

        <h2>6. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access and download your reports at any time</li>
          <li>Delete individual reports from your history</li>
          <li>Delete your account and all associated data</li>
          <li>Use the service anonymously without creating an account</li>
        </ul>
        <p>
          Account deletion purges all associated reports, presets, and account data within 24 hours.
          A confirmation email is sent upon completion.
        </p>

        <h2>7. Contact</h2>
        <p>
          If you have questions about this Privacy Policy or your data, please contact us through the{' '}
          <Link to="/help">Help Center</Link>.
        </p>

        <div className="legal-footer-links">
          <Link to="/terms">Terms of Use</Link>
          <Link to="/help">Help Center</Link>
          <Link to="/">Back to Screenetic</Link>
        </div>
      </article>
    </div>
  );
}
