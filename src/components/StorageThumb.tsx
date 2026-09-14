import type { StorageType } from '@/api/types';
import { AuthImage } from './ui/AuthImage';
import { StorageIcon } from './Icons';
import '@/routes/Screens.css';

/** A storage's photo when it has one (easier to recognise), otherwise its type icon. */
export function StorageThumb({
  type, coverMediaId, small,
}: { type: StorageType; coverMediaId: string | null | undefined; small?: boolean }) {
  const className = small ? 'icon-tile icon-tile-sm' : 'icon-tile';
  const icon = (
    <span className={className} aria-hidden>
      <StorageIcon type={type} size={small ? 15 : 18} />
    </span>
  );
  if (!coverMediaId) return icon;
  return <AuthImage mediaId={coverMediaId} alt="" className={className} fallback={icon} />;
}
