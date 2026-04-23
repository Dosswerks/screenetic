import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type AuthView = 'login' | 'register' | 'forgot' | 'verify' | 'reset';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PW_MIN = 8;
const PW_UPPER = /[A-Z]/;
const PW_LOWER = /[a-z]/;
const PW_DIGIT = /\d/;

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required.';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address.';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < PW_MIN) return `Password must be at least ${PW_MIN} characters.`;
  if (!PW_UPPER.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!PW_LOWER.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!PW_DIGIT.test(password)) return 'Password must contain at least one number.';
  return null;
}

export function LoginScreen() {
  const { login: authLogin, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Determine initial view from URL params
  const getInitialView = (): AuthView => {
    if (searchParams.has('token') && searchParams.has('reset')) return 'reset';
    if (searchParams.has('token')) return 'verify';
    return 'login';
  };

  const [view, setView] = useState<AuthView>(getInitialView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const returnTo = searchParams.get('returnTo') || '/';
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, navigate, searchParams]);

  // Auto-verify on mount if token present
  useEffect(() => {
    if (view === 'verify') {
      const token = searchParams.get('token');
      if (token) verifyEmail(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearMessages = () => { setError(null); setSuccess(null); };

  const switchView = (v: AuthView) => {
    clearMessages();
    setPassword('');
    setConfirmPassword('');
    setView(v);
  };

  async function apiCall(url: string, body: Record<string, string>): Promise<{ ok: boolean; data: Record<string, string> }> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ message: 'Unexpected error' }));
    return { ok: res.ok, data };
  }

  // ---- Login ----
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    const emailErr = validateEmail(email);
    if (emailErr) { setError(emailErr); return; }
    if (!password) { setError('Password is required.'); return; }

    setLoading(true);
    try {
      const { ok, data } = await apiCall('/api/auth/login', { email, password });
      if (!ok) { setError(data.message || 'Login failed.'); return; }
      authLogin(data.accessToken, data.refreshToken);
      const returnTo = searchParams.get('returnTo') || '/';
      navigate(returnTo, { replace: true });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ---- Register ----
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    const emailErr = validateEmail(email);
    if (emailErr) { setError(emailErr); return; }
    const pwErr = validatePassword(password);
    if (pwErr) { setError(pwErr); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const { ok, data } = await apiCall('/api/auth/register', { email, password });
      if (!ok) { setError(data.message || 'Registration failed.'); return; }
      setSuccess('Check your email to verify your account.');
      setPassword('');
      setConfirmPassword('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ---- Forgot Password ----
  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    const emailErr = validateEmail(email);
    if (emailErr) { setError(emailErr); return; }

    setLoading(true);
    try {
      const { ok, data } = await apiCall('/api/auth/forgot', { email });
      if (!ok) { setError(data.message || 'Request failed.'); return; }
      setSuccess('If that email is registered, you will receive a password reset link.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ---- Verify Email ----
  const verifyEmail = useCallback(async (token: string) => {
    clearMessages();
    setLoading(true);
    try {
      const { ok, data } = await apiCall('/api/auth/verify', { token });
      if (!ok) { setError(data.message || 'Verification failed.'); return; }
      setSuccess('Email verified! You can now log in.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- Reset Password ----
  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    const pwErr = validatePassword(password);
    if (pwErr) { setError(pwErr); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    const token = searchParams.get('token');
    if (!token) { setError('Invalid reset link.'); return; }

    setLoading(true);
    try {
      const { ok, data } = await apiCall('/api/auth/reset', { token, newPassword: password });
      if (!ok) { setError(data.message || 'Reset failed.'); return; }
      setSuccess('Password reset! You can now log in with your new password.');
      setPassword('');
      setConfirmPassword('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {view === 'login' && (
          <>
            <h2 className="auth-title">Log in to Screenetic</h2>
            <form onSubmit={handleLogin} className="auth-form" noValidate>
              <label className="auth-label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
              />
              <label className="auth-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
              />
              {error && <p className="auth-error" role="alert">{error}</p>}
              {success && <p className="auth-success" role="status">{success}</p>}
              <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
                {loading ? 'Logging in…' : 'Log in'}
              </button>
            </form>
            <div className="auth-links">
              <button className="auth-link" type="button" onClick={() => switchView('register')}>Create an account</button>
              <button className="auth-link" type="button" onClick={() => switchView('forgot')}>Forgot password?</button>
            </div>
          </>
        )}

        {view === 'register' && (
          <>
            <h2 className="auth-title">Create an account</h2>
            <form onSubmit={handleRegister} className="auth-form" noValidate>
              <label className="auth-label" htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
              />
              <label className="auth-label" htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
              />
              <label className="auth-label" htmlFor="reg-confirm">Confirm password</label>
              <input
                id="reg-confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
              <p className="auth-hint">Min 8 characters, 1 uppercase, 1 lowercase, 1 number.</p>
              {error && <p className="auth-error" role="alert">{error}</p>}
              {success && <p className="auth-success" role="status">{success}</p>}
              <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
            <div className="auth-links">
              <button className="auth-link" type="button" onClick={() => switchView('login')}>Already have an account? Log in</button>
            </div>
          </>
        )}

        {view === 'forgot' && (
          <>
            <h2 className="auth-title">Reset your password</h2>
            <p className="auth-subtitle">Enter your email and we'll send a reset link.</p>
            <form onSubmit={handleForgot} className="auth-form" noValidate>
              <label className="auth-label" htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
              />
              {error && <p className="auth-error" role="alert">{error}</p>}
              {success && <p className="auth-success" role="status">{success}</p>}
              <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <div className="auth-links">
              <button className="auth-link" type="button" onClick={() => switchView('login')}>Back to login</button>
            </div>
          </>
        )}

        {view === 'verify' && (
          <>
            <h2 className="auth-title">Email verification</h2>
            {loading && <p className="auth-loading">Verifying your email…</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            {success && <p className="auth-success" role="status">{success}</p>}
            <div className="auth-links">
              <button className="auth-link" type="button" onClick={() => switchView('login')}>Go to login</button>
            </div>
          </>
        )}

        {view === 'reset' && (
          <>
            <h2 className="auth-title">Set a new password</h2>
            <form onSubmit={handleReset} className="auth-form" noValidate>
              <label className="auth-label" htmlFor="reset-password">New password</label>
              <input
                id="reset-password"
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
              />
              <label className="auth-label" htmlFor="reset-confirm">Confirm new password</label>
              <input
                id="reset-confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
              <p className="auth-hint">Min 8 characters, 1 uppercase, 1 lowercase, 1 number.</p>
              {error && <p className="auth-error" role="alert">{error}</p>}
              {success && <p className="auth-success" role="status">{success}</p>}
              <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
                {loading ? 'Resetting…' : 'Reset password'}
              </button>
            </form>
            <div className="auth-links">
              <button className="auth-link" type="button" onClick={() => switchView('login')}>Back to login</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
