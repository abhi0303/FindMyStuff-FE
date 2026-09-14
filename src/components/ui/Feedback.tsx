import type { ReactNode } from 'react';
import './ui.css';

export function EmptyState({
  icon, illustration, title, description, action,
}: {
  icon?: ReactNode;
  /** Image URL from `@/assets/illustrations`; shown instead of the icon. Decorative — the title carries the meaning. */
  illustration?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {illustration ? (
        <div className="empty-art"><img src={illustration} alt="" /></div>
      ) : (
        icon && <div className="empty-icon">{icon}</div>
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

/**
 * Compact empty hint for a section that already has its own Add action in its
 * header — deliberately no buttons, so the action is never offered twice.
 */
export function EmptyRow({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="empty-row">
      <span className="empty-row-icon" aria-hidden>{icon}</span>
      <span className="stack" style={{ minWidth: 0 }}>
        <span className="empty-row-title">{title}</span>
        {hint && <span className="empty-row-hint">{hint}</span>}
      </span>
    </div>
  );
}

type AlertKind = 'danger' | 'warning' | 'info' | 'success';

export function Alert({ kind = 'info', children }: { kind?: AlertKind; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'danger' ? 'alert' : undefined}>
      <div className="grow">{children}</div>
    </div>
  );
}

/** Validation errors arrive as an array; render each on its own line. */
export function ErrorAlert({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <Alert kind="danger">
      <pre>{message}</pre>
    </Alert>
  );
}

type BadgeTone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success' | 'info';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Chip({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <span className={['chip', onRemove && 'chip-removable'].filter(Boolean).join(' ')}>
      {children}
      {onRemove && (
        <button type="button" className="chip-x" onClick={onRemove} aria-label={`Remove ${String(children)}`}>
          ×
        </button>
      )}
    </span>
  );
}

export function Skeleton({ height = 16, width = '100%', radius }: { height?: number | string; width?: number | string; radius?: number }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius }} />;
}

export function SkeletonList({ rows = 4, height = 64 }: { rows?: number; height?: number }) {
  return (
    <div className="stack gap-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} radius={12} />
      ))}
    </div>
  );
}
