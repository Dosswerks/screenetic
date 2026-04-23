import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { DeviceProvider } from './contexts/DeviceContext';

import { URLEntryScreen } from './screens/URLEntryScreen';
import { SideBySideScreen } from './screens/SideBySideScreen';
import { ReportScreen } from './screens/ReportScreen';
import { LoginScreen } from './screens/LoginScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ReportDetailScreen } from './screens/ReportDetailScreen';
import { HelpScreen } from './screens/HelpScreen';
import { TermsScreen } from './screens/TermsScreen';
import { PrivacyScreen } from './screens/PrivacyScreen';

// Phase 1: frontend-only mode (no backend). Set to true when backend is deployed.
const BACKEND_ENABLED = false;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Moves focus to the first interactive element inside <main> on route changes.
 */
function FocusOnNavigate({ mainRef }: { mainRef: React.RefObject<HTMLElement | null> }) {
  const location = useLocation();
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      prevPath.current = location.pathname;
      requestAnimationFrame(() => {
        const main = mainRef.current;
        if (!main) return;
        const focusable = main.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable) {
          focusable.focus();
        }
      });
    }
  }, [location.pathname, mainRef]);

  return null;
}

function App() {
  const mainRef = useRef<HTMLElement>(null);

  return (
    <BrowserRouter>
      <AuthProvider>
        <DeviceProvider>
          <FocusOnNavigate mainRef={mainRef} />
          <div className="app">
            <header className="app-header">
              <Link to="/" className="app-logo">Screenetic</Link>
              <nav className="app-nav" aria-label="Main navigation">
                {BACKEND_ENABLED && <Link to="/history">History</Link>}
                <Link to="/help">Help</Link>
                {BACKEND_ENABLED && <Link to="/login">Login</Link>}
              </nav>
            </header>
            <main ref={mainRef}>
              <Routes>
                <Route path="/" element={<URLEntryScreen />} />
                <Route path="/compare" element={<SideBySideScreen />} />
                <Route path="/report" element={<ReportScreen />} />
                {BACKEND_ENABLED && <Route path="/report/:id" element={<ReportDetailScreen />} />}
                {BACKEND_ENABLED && <Route path="/login" element={<LoginScreen />} />}
                {BACKEND_ENABLED && <Route path="/history" element={<HistoryScreen />} />}
                <Route path="/help" element={<HelpScreen />} />
                <Route path="/help/:slug" element={<HelpScreen />} />
                <Route path="/terms" element={<TermsScreen />} />
                <Route path="/privacy" element={<PrivacyScreen />} />
              </Routes>
            </main>
            <footer className="app-footer">
              <Link to="/help">Help</Link>
              <Link to="/terms">Terms of Use</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <span className="footer-muted">Screenetic v0.1.0</span>
            </footer>
          </div>
        </DeviceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
