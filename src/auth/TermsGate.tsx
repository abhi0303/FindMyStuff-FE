import { useState } from 'react';
import { useAuth } from './AuthContext';
import { Button } from '@/components/ui/Button';
import { Alert, ErrorAlert } from '@/components/ui/Feedback';
import { toMessage } from '@/api/errors';

/**
 * The server stores which terms version each user accepted. When it bumps
 * TERMS_VERSION every existing user must re-accept — no app release needed — and
 * authenticated routes start returning 403 TERMS_ACCEPTANCE_REQUIRED until they do.
 */
export function TermsGate() {
  const { requiredTermsVersion, acceptTerms, logout, user } = useAuth();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await acceptTerms();
    } catch (err) {
      setError(toMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 'var(--space-5)' }}>
      <div className="card card-pad stack gap-5" style={{ width: '100%', maxWidth: 460 }}>
        <div className="stack gap-2">
          <h1>Updated terms</h1>
          <p className="text-muted" style={{ fontSize: 14 }}>
            {user?.name ? `Hi ${user.name.split(' ')[0]}, our` : 'Our'} terms and conditions have
            changed. Please review and accept them to keep using FindMyStuff.
          </p>
        </div>

        {requiredTermsVersion && (
          <Alert kind="info">
            Version <strong>{requiredTermsVersion}</strong>
            {user?.termsVersion && <> · you previously accepted {user.termsVersion}</>}
          </Alert>
        )}

        <ErrorAlert message={error} />

        <label className="checkbox-row">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span style={{ fontSize: 14 }}>
            I have read and accept the{' '}
            <a href="/terms" target="_blank" rel="noreferrer">terms and conditions</a> and{' '}
            <a href="/privacy" target="_blank" rel="noreferrer">privacy policy</a>.
          </span>
        </label>

        <div className="stack gap-2">
          <Button variant="primary" block onClick={submit} disabled={!checked} loading={submitting}>
            Accept and continue
          </Button>
          <Button variant="ghost" block onClick={logout}>Sign out instead</Button>
        </div>
      </div>
    </div>
  );
}
