import { Link } from 'react-router-dom';
import type { PlaceListItem } from '@/api/types';
import { AuthImage, Avatar } from './ui/AuthImage';
import { Badge } from './ui/Feedback';
import { ChevronRight, PlaceIcon } from './Icons';
import { placeTypeLabel, roleLabel } from '@/lib/labels';
import { pluralize } from '@/lib/format';
import '@/routes/Screens.css';

/** One place as a list row — meant to sit inside a `.list`. */
export function PlaceCard({ place }: { place: PlaceListItem }) {
  const meta = [
    placeTypeLabel(place.type),
    place.city,
    pluralize(place.itemCount, 'thing'),
    pluralize(place.storageCount, 'storage'),
  ].filter(Boolean).join(' · ');

  return (
    <Link to={`/places/${place.id}`} className="item-row">
      <AuthImage
        mediaId={place.coverMediaId}
        alt=""
        className="item-thumb"
        fallback={<span className="icon-tile" aria-hidden><PlaceIcon type={place.type} size={19} /></span>}
      />

      <span className="item-main">
        <span className="item-name truncate">{place.name}</span>
        <span className="meta-line">
          {place.myRole !== 'MEMBER' && (
            <Badge tone={place.myRole === 'OWNER' ? 'accent' : 'neutral'}>{roleLabel(place.myRole)}</Badge>
          )}
          <span className="item-meta truncate">{meta}</span>
        </span>
      </span>

      {place.memberCount > 1 && (
        <span className="member-stack" title={pluralize(place.memberCount, 'member')}>
          {place.members.slice(0, 3).map((member) => (
            <Avatar key={member.id} name={member.name} mediaId={member.avatarMediaId} size={22} />
          ))}
        </span>
      )}

      <ChevronRight size={16} className="row-chevron" />
    </Link>
  );
}
