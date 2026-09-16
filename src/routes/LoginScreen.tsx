import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { toMessage } from '@/api/errors';
import { ApiError } from '@/api/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ErrorAlert } from '@/components/ui/Feedback';
import { BrandMark } from '@/components/BrandMark';
import './Auth.css';

export default function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return; // auth routes allow 10 requests / 5 min — do not spam them
    setSubmitting(true);
    setError(null);
    try {
      await login({ email: email.trim(), password });
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.isRateLimited
          ? 'Too many attempts. Please wait a few minutes and try again.'
          : toMessage(err),
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><BrandMark size={26} /></span>
          <h1>Welcome back</h1>
          <p>Sign in to find your things.</p>
        </div>

        <form className="card card-pad stack gap-4" onSubmit={submit}>
          <ErrorAlert message={error} />

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          <Button type="submit" variant="primary" size="lg" block loading={submitting}>
            Sign in
          </Button>
        </form>

        <p className="auth-foot">
          New here? <Link to="/signup">Create an account</Link>
        </p>

        {import.meta.env.DEV && (
          <div className="demo-note">
            <strong>Seeded accounts</strong> (password <code>Password123</code>)<br />
            <code>owner@findmystuff.test</code> — owner, has a private Passport<br />
            <code>family@findmystuff.test</code> — member, cannot see it
          </div>
        )}
      </div>
    </div>
  );
}
