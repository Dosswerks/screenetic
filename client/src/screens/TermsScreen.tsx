import { Link } from 'react-router-dom';

export function TermsScreen() {
  return (
    <div className="legal-screen">
      <article className="legal-content" aria-label="Terms of Use">
        <h1>Terms of Use</h1>
        <p className="legal-placeholder-notice">
          ⚠️ This is placeholder legal text for development purposes. It should be reviewed and
          replaced by qualified legal counsel before production use.
        </p>
        <p className="legal-effective">Effective Date: January 1, 2025</p>

        <h2>1. Service Description</h2>
        <p>
          Screenetic is a web-based mobile device testing and comparison tool. It renders URLs in
          simulated device viewports using iframes with user-agent spoofing and viewport resizing.
          All page rendering occurs client-side in your browser. Screenetic's server never sees or
          processes the content of the pages you test.
        </p>

        <h2>2. Acceptable Use</h2>
        <p>
          You are solely responsible for ensuring you have authorization to test any URL you submit
          to Screenetic. Screenetic does not verify ownership or permission for tested URLs. You
          agree not to use the service to:
        </p>
        <ul>
          <li>Test URLs you do not have permission to access or analyze</li>
          <li>Attempt to circumvent security measures of third-party websites</li>
          <li>Generate reports for malicious purposes, including competitive intelligence gathering without authorization</li>
          <li>Overload or abuse the service through automated or excessive requests</li>
        </ul>

        <h2>3. User Accounts</h2>
        <p>
          You may use Screenetic anonymously or create an authenticated account. If you create an
          account, you are responsible for maintaining the confidentiality of your credentials.
          Anonymous sessions are temporary and subject to the data retention policy described in our{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>

        <h2>4. Data Handling</h2>
        <p>
          Reports you generate may be stored on our servers. Anonymous reports are retained for 7
          days. Authenticated reports are retained until you delete them or close your account.
          Screenshots are stored in encrypted object storage. For full details, see our{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>

        <h2>5. Simulation Disclaimers</h2>
        <p>
          Screenetic provides simulation-based results, not authoritative device testing. Browser
          simulation uses user-agent string spoofing and viewport resizing — it does not replicate
          the native rendering engine of the simulated browser. Results should not be treated as a
          guarantee of real-device behavior.
        </p>
        <p>
          Performance metrics are measured within your host browser environment and may vary from
          real-device measurements. Issue detection is heuristic-based and may produce false
          positives. All findings should be verified manually.
        </p>

        <h2>6. Content Responsibility</h2>
        <p>
          Screenetic is not responsible for any content rendered within viewports, including content
          that may be copyrighted, restricted, or inappropriate. The content of tested pages is
          loaded directly in your browser and is never transmitted to or processed by Screenetic's
          servers.
        </p>

        <h2>7. Limitation of Liability</h2>
        <p>
          Screenetic is provided "as-is" without warranty of any kind, express or implied. We do not
          warrant that the service will be uninterrupted, error-free, or that simulation results will
          be accurate. In no event shall Screenetic be liable for any indirect, incidental, special,
          or consequential damages arising from your use of the service.
        </p>

        <h2>8. Changes to Terms</h2>
        <p>
          We may update these Terms of Use from time to time. Changes will be posted on this page
          with an updated effective date. Continued use of Screenetic after changes are posted
          constitutes acceptance of the revised terms.
        </p>

        <div className="legal-footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/help">Help Center</Link>
          <Link to="/">Back to Screenetic</Link>
        </div>
      </article>
    </div>
  );
}
