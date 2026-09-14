import { Fragment } from 'react';
import { ChevronRight } from './Icons';
import './StorageTree.css';

/**
 * Every relevant response already carries a `breadcrumb` — "Bedroom › Almirah › Top
 * shelf", and for search results it includes the place name too. We render it as
 * given and never join names ourselves. Splitting is presentational only: the last
 * segment is where the thing actually is, so it gets the emphasis.
 */
export function Breadcrumb({
  value, emphasizeLast = true, className, variant = 'inline',
}: {
  value: string | null | undefined;
  emphasizeLast?: boolean;
  className?: string;
  /** `path` renders each level as a chip — for the "where is it" card. */
  variant?: 'inline' | 'path';
}) {
  if (!value) {
    return <span className={['breadcrumb', 'breadcrumb-none', className].filter(Boolean).join(' ')}>Not put away yet</span>;
  }

  const parts = value.split('›').map((p) => p.trim()).filter(Boolean);
  const last = parts.length - 1;

  if (variant === 'path') {
    return (
      <span className={['crumb-path', className].filter(Boolean).join(' ')} title={value}>
        {parts.map((part, i) => (
          <Fragment key={`${part}-${i}`}>
            <span className={i === last ? 'crumb crumb-last' : 'crumb'}>{part}</span>
            {i < last && <span className="crumb-sep" aria-hidden><ChevronRight size={12} /></span>}
          </Fragment>
        ))}
      </span>
    );
  }

  return (
    <span className={['breadcrumb', className].filter(Boolean).join(' ')} title={value}>
      {parts.map((part, i) => (
        <span key={`${part}-${i}`} className={emphasizeLast && i === last ? 'breadcrumb-strong' : undefined}>
          {part}
          {i < last && <span aria-hidden style={{ margin: '0 5px', opacity: 0.5 }}>›</span>}
        </span>
      ))}
    </span>
  );
}
