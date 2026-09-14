import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePlace, usePlaceActivity } from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorAlert, SkeletonList } from '@/components/ui/Feedback';
import { Avatar } from '@/components/ui/AuthImage';
import { ArrowLeft, HistoryIcon } from '@/components/Icons';
import { formatDateTime } from '@/lib/format';
import { toMessage } from '@/api/errors';
import './Screens.css';

export default function ActivityScreen() {
  const { placeId = '' } = useParams();
  const [page, setPage] = useState(1);
  const place = usePlace(placeId);
  const activity = usePlaceActivity(placeId, page);

  return (
    <div className="stack gap-4">
      <Link to={`/places/${placeId}`} className="back-link">
        <ArrowLeft size={15} /> {place.data?.name ?? 'Place'}
      </Link>

      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="text-muted text-sm">Who did what, newest first.</p>
        </div>
      </div>

      {activity.isLoading ? (
        <SkeletonList rows={6} height={54} />
      ) : activity.isError ? (
        <ErrorAlert message={toMessage(activity.error)} />
      ) : activity.data?.data.length ? (
        <>
          <div className="timeline">
            {activity.data.data.map((entry) => (
              <div key={entry.id} className="timeline-item">
                <span className="timeline-dot"><HistoryIcon size={10} /></span>
                <div className="row gap-3 grow" style={{ minWidth: 0 }}>
                  <Avatar name={entry.actor.name} mediaId={entry.actor.avatarMediaId} size={26} />
                  <div className="stack gap-1 grow" style={{ minWidth: 0 }}>
                    {/* `summary` arrives ready to render — no assembly needed. */}
                    <span className="text-sm">{entry.summary}</span>
                    <span className="text-xs text-subtle">{formatDateTime(entry.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row gap-2 center">
            <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Newer
            </Button>
            <span className="text-sm text-subtle">
              Page {activity.data.meta.page} of {activity.data.meta.totalPages}
            </span>
            <Button
              size="sm" variant="secondary"
              disabled={!activity.data.meta.hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Older
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<HistoryIcon size={22} />}
          title="Nothing has happened yet"
          description="Adding and moving things will show up here."
        />
      )}
    </div>
  );
}
