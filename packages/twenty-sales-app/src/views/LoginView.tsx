import { useState } from 'react';

import { login } from '../api/auth';
import { T } from '../lib/strings';

type LoginViewProps = {
  onLoggedIn: () => void;
};

export const LoginView = ({ onLoggedIn }: LoginViewProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : T.loginFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-side">
        <div className="mark">هـ</div>
        <h1>{T.appName}</h1>
        <p>
          ثبت لید در چند ثانیه، کارهای امروز در یک نگاه، و دستیار هوشمند برای
          هر لید — همه در یک جا.
        </p>
      </div>
      <div className="login-form-side">
        <div className="login-box">
          <h2>{T.signInTitle}</h2>
          <div className="sub">{T.signInSub}</div>

          {error !== null && <div className="error-banner">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="fld">
              <label htmlFor="login-email">{T.email}</label>
              <input
                id="login-email"
                type="email"
                dir="ltr"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="fld" style={{ marginBottom: 18 }}>
              <label htmlFor="login-password">{T.password}</label>
              <input
                id="login-password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn gold block" type="submit" disabled={busy} style={{ padding: 12 }}>
              {busy ? T.signingIn : T.signIn}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
