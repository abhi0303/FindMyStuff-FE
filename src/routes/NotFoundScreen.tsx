import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { illustrations } from '@/assets/illustrations';

/**
 * The API returns 404 both for things that do not exist and for things that exist
 * but belong to someone else — deliberately, so it never confirms other people's
 * data. The copy therefore never says "you don't have access".
 */
export function NotFoundBody({ what = 'page' }: { what?: string }) {
  return (
    <EmptyState
      illustration={illustrations.noResults}
      title={`This ${what} isn't here`}
      description="It may have been deleted, or the link may be wrong."
      action={<ButtonLink to="/" variant="primary">Go home</ButtonLink>}
    />
  );
}

export default function NotFoundScreen() {
  return <NotFoundBody />;
}
