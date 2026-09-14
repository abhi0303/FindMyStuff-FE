import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import './ui.css';

interface FieldShellProps {
  label?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (id: string, invalid: boolean) => ReactNode;
}

function FieldShell({ label, hint, error, optional, children }: FieldShellProps) {
  const id = useId();
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
          {optional && <span className="field-optional"> · optional</span>}
        </label>
      )}
      {children(id, Boolean(error))}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string; hint?: string; error?: string; optional?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optional, className, ...rest }, ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional}>
      {(id, invalid) => (
        <input
          ref={ref}
          id={id}
          className={['input', className].filter(Boolean).join(' ')}
          aria-invalid={invalid || undefined}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string; hint?: string; error?: string; optional?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, className, ...rest }, ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional}>
      {(id, invalid) => (
        <textarea
          ref={ref}
          id={id}
          className={['textarea', className].filter(Boolean).join(' ')}
          aria-invalid={invalid || undefined}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; hint?: string; error?: string; optional?: boolean; children: ReactNode;
}

export function Select({ label, hint, error, optional, children, className, ...rest }: SelectProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional}>
      {(id) => (
        <div className="select-wrap">
          <select id={id} className={['select', className].filter(Boolean).join(' ')} {...rest}>
            {children}
          </select>
        </div>
      )}
    </FieldShell>
  );
}

export function Switch({
  checked, onChange, label, description,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div
      className="switch-row"
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
    >
      <span className="stack gap-1">
        <span className="semibold" style={{ fontSize: 14 }}>{label}</span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </span>
      <span className="switch" data-on={checked} aria-hidden />
    </div>
  );
}
