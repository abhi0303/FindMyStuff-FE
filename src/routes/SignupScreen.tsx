import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { ApiError, toMessage } from '@/api/errors';
import { placesApi } from '@/api/endpoints';
import { takeInviteCode, peekInviteCode } from '@/auth/pendingInvite';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Alert, ErrorAlert } from '@/components/ui/Feedback';
import { BoxIcon } from '@/components/Icons';
import { useToast } from '@/components/ui/Toast';
import './Auth.css';

/** Mirrors the server rule: 8+ characters with an uppercase, a lowercase and a digit. */
function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'At least 8 characters.';
  if (!/[a-z]/.test(password)) return 'Add a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Add an uppercase letter.';
  if (!/\d/.test(password)) return 'Add a digit.';
  return null;
}

export default function SignupScreen() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touchedPassword, setTouchedPassword] = useState(false);

  const pendingInvite = useMemo(() => peekInviteCode(), []);
  const passwordError = touchedPassword ? passwordProblem(password) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const problem = passwordProblem(password);
    if (problem) {
      setTouchedPassword(true);
      setError(`Password: ${problem}`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signup({
        email: email.trim(),
        name: name.trim(),
        password,
        // Only send phone when there is one — the server validates the format.
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        acceptTerms: true,
      });

      // Redeem an invite that brought them here in the first place.
      const code = takeInviteCode();
      if (code) {
        try {
          const place = await placesApi.acceptInvite(code);
          toast.success(`You've joined ${place.name}.`);
        } catch {
          toast.error('That invite could not be redeemed. Ask for a new one.');
        }
      }

      navigate('/', { replace: true });
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
          <span className="brand-mark"><BoxIcon size={26} /></span>
          <h1>Create your account</h1>
          <p>Keep track of where everything lives.</p>
        </div>

        <form className="card card-pad stack gap-4" onSubmit={submit}>
          {pendingInvite && (
            <Alert kind="info">
              You’ve been invited to a place. We’ll add you as soon as you sign up.
            </Alert>
          )}

          <ErrorAlert message={error} />

          <Input
            label="Name" required autoComplete="name" value={name}
            onChange={(e) => setName(e.target.value)} placeholder="Shristi Gupta"
          />
          <Input
            label="Email" type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
          />
          <Input
            label="Phone" optional type="tel" autoComplete="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="+919876543210"
            hint="International format, starting with +."
          />
          <Input
            label="Password" type="password" required autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouchedPassword(true)}
            error={passwordError ?? undefined}
            hint={passwordError ? undefined : '8+ characters, with an uppercase, a lowercase and a digit.'}
          />

          <label className="checkbox-row">
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
            <span style={{ fontSize: 14 }}>
              I accept the <a href={`${import.meta.env.BASE_URL}terms`} target="_blank" rel="noreferrer">terms and conditions</a>.
            </span>
          </label>

          <Button type="submit" variant="primary" size="lg" block disabled={!acceptTerms} loading={submitting}>
            Create account
          </Button>
        </form>

        <p className="auth-foot">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
