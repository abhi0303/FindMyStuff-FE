import { Link } from 'react-router-dom';
import type { Item, ItemStatus } from '@/api/types';
import { AuthImage } from './ui/AuthImage';
import { Badge } from './ui/Feedback';
import { Breadcrumb } from './Breadcrumb';
import { BoxIcon, LockIcon } from './Icons';
import { daysUntil, formatDate } from '@/lib/format';
import { statusLabel } from '@/lib/labels';
import '@/routes/Screens.css';

export function StatusBadge({ status }: { status: ItemStatus }) {
  if (status === 'AVAILABLE') return null;
  const tone = status === 'LENT_OUT' ? 'warning' : status === 'LOST' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{statusLabel(status)}</Badge>;
}

/** Expiry only earns a badge once it is close enough to act on. */
export function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const days = daysUntil(expiresAt);
  if (days === null || days > 30) return null;
  if (days < 0) return <Badge tone="danger">Expired {formatDate(expiresAt)}</Badge>;
  if (days === 0) return <Badge tone="danger">Expires today</Badge>;
  return <Badge tone="warning">Expires in {days}d</Badge>;
}

export function ItemRow({ item, placeId }: { item: Item; placeId: string }) {
  return (
    <Link to={`/places/${placeId}/items/${item.id}`} className="item-row">
      <AuthImage
        mediaId={item.mediaIds?.[0]}
        alt=""
        className="item-thumb"
        fallback={<span className="icon-tile" aria-hidden><BoxIcon size={18} /></span>}
      />

      <span className="item-main">
        <span className="item-name">
          <span className="truncate">{item.name}</span>
          {item.visibility === 'PRIVATE' && (
            <LockIcon size={13} aria-label="Only visible to you" style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
          )}
          {item.quantity > 1 && <span className="text-xs text-subtle">×{item.quantity}</span>}
        </span>
        <Breadcrumb value={item.storage?.breadcrumb} emphasizeLast={false} className="text-xs" />
      </span>

      <span className="row gap-1" style={{ flexShrink: 0 }}>
        <StatusBadge status={item.status} />
        <ExpiryBadge expiresAt={item.expiresAt} />
      </span>
    </Link>
  );
}
