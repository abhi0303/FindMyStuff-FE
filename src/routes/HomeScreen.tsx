import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAttention, usePlaces } from '@/hooks/queries';
import { useAuth } from '@/auth/AuthContext';
import type { AttentionItem } from '@/api/types';
import { ButtonLink } from '@/components/ui/Button';
import { Badge, EmptyState, ErrorAlert, SkeletonList } from '@/components/ui/Feedback';
import { PlaceCard } from '@/components/PlaceCard';
import { HeaderCard } from '@/components/HeaderCard';
import { Breadcrumb } from '@/components/Breadcrumb';
import { AlertIcon, BoxIcon, ClockIcon, HandIcon, PlusIcon, SearchIcon, ShieldIcon } from '@/components/Icons';
import { stickers } from '@/assets/stickers';
import { daysUntil, formatDate, relativeTime } from '@/lib/format';
import { toMessage } from '@/api/errors';
import './Screens.css';

type Bucket = 'expiring' | 'warranty' | 'overdue' | 'lowStock';

const BUCKETS: { key: Bucket; label: string; urgent?: boolean; icon: typeof ClockIcon }[] = [
  { key: 'overdue', label: 'Overdue back', urgent: true, icon: HandIcon },
  { key: 'expiring', label: 'Expiring', icon: ClockIcon },
  { key: 'lowStock', label: 'Running low', icon: AlertIcon },
  { key: 'warranty', label: 'Warranty ending', icon: ShieldIcon },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const places = usePlaces();
  const attention = useAttention(30);
  const [openBucket, setOpenBucket] = useState<Bucket | null>(null);

  const buckets = attention.data;
  const total = buckets
    ? buckets.expiring.length + buckets.warranty.length + buckets.overdue.length + buckets.lowStock.length
    : 0;

  const firstName = user?.name?.split(' ')[0];

  return (
    <div className="stack gap-5">
      {/* The character mirrors the status line: thumbs up when all is well, thinking when something needs a look. */}
      <HeaderCard
        title={firstName ? `Hi, ${firstName}` : 'Your things'}
        subtitle={
          total > 0 ? `${total} ${total === 1 ? 'thing needs' : 'things need'} your attention.` : 'Everything looks fine.'
        }
        sticker={total > 0 ? stickers.thinking : stickers.thumbsUp}
        accent={stickers.star}
      >
        <Link to="/search" className="search-trigger">
          <SearchIcon size={17} />
          Search everything you own
        </Link>
      </HeaderCard>

      {/* ---- needs attention ---- */}
      {attention.isLoading ? (
        <SkeletonList rows={1} height={64} />
      ) : attention.isError ? (
        <ErrorAlert message={toMessage(attention.error)} />
      ) : total > 0 ? (
        <section className="stack gap-2">
          <h2 className="section-title">Needs attention</h2>

          <div className="stat-row">
            {BUCKETS.map(({ key, label, urgent }) => {
              const count = buckets?.[key].length ?? 0;
              if (count === 0) return null;
              const active = openBucket === key;
              return (
                <button key={key} className="stat" aria-pressed={active} onClick={() => setOpenBucket(active ? null : key)}>
                  <span className={urgent ? 'stat-num is-danger' : 'stat-num'}>{count}</span>
                  <span className="stat-label">{label}</span>
                </button>
              );
            })}
          </div>

          {openBucket && buckets && (
            <div className="list">
              {buckets[openBucket].map((item) => (
                <AttentionRow key={`${openBucket}-${item.id}`} item={item} bucket={openBucket} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* ---- places ---- */}
      <section className="stack gap-2">
        <div className="section-head">
          <h2 className="section-title">Your places</h2>
          <Link to="/places">See all</Link>
        </div>

        {places.isLoading ? (
          <SkeletonList rows={2} height={56} />
        ) : places.isError ? (
          <ErrorAlert message={toMessage(places.error)} />
        ) : places.data?.length ? (
          <div className="list">
            {places.data.slice(0, 4).map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<BoxIcon size={22} />}
            title="No places yet"
            description="A place is a home, an office, a car — anything with stuff in it. Add one to get started."
            action={
              <ButtonLink to="/places" variant="primary">
                <PlusIcon size={16} />
                Add a place
              </ButtonLink>
            }
          />
        )}
      </section>
    </div>
  );
}

function AttentionRow({ item, bucket }: { item: AttentionItem; bucket: Bucket }) {
  // The attention payload does not carry placeId on every bucket; fall back to the
  // place we do get so the link always resolves.
  const placeId = item.placeId ?? item.place.id;
  const Icon = BUCKETS.find((b) => b.key === bucket)!.icon;

  return (
    <Link to={`/places/${placeId}/items/${item.id}`} className="item-row">
      <span className="icon-tile" aria-hidden><Icon size={18} /></span>

      <span className="item-main">
        <span className="item-name truncate">{item.name}</span>
        <span className="text-xs text-subtle truncate">
          {item.storage?.breadcrumb ? (
            <Breadcrumb value={item.storage.breadcrumb} emphasizeLast={false} className="text-xs" />
          ) : (
            item.place.name
          )}
        </span>
      </span>

      {attentionBadge(item, bucket)}
    </Link>
  );
}

function attentionBadge(item: AttentionItem, bucket: Bucket) {
  if (bucket === 'overdue') {
    return <Badge tone="danger">{item.lentToName ? `${item.lentToName} · ` : ''}due {relativeTime(item.dueAt)}</Badge>;
  }
  if (bucket === 'lowStock') {
    return <Badge tone="warning">{item.quantity} left</Badge>;
  }
  if (bucket === 'warranty') {
    return <Badge tone="neutral">until {formatDate(item.warrantyUntil)}</Badge>;
  }
  const days = daysUntil(item.expiresAt);
  return (
    <Badge tone={days !== null && days < 0 ? 'danger' : 'warning'}>
      {days !== null && days < 0 ? 'expired' : `in ${days}d`}
    </Badge>
  );
}
