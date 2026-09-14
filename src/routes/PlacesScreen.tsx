import { useState } from 'react';
import { useCreatePlace, usePlaces } from '@/hooks/queries';
import { PlaceCard } from '@/components/PlaceCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorAlert, SkeletonList } from '@/components/ui/Feedback';
import { BoxIcon, PlusIcon } from '@/components/Icons';
import { PlaceFormModal } from '@/components/PlaceFormModal';
import { HeaderCard } from '@/components/HeaderCard';
import { stickers } from '@/assets/stickers';
import { toMessage } from '@/api/errors';
import { useToast } from '@/components/ui/Toast';
import './Screens.css';

export default function PlacesScreen() {
  const { data, isLoading, isError, error } = usePlaces();
  const createPlace = useCreatePlace();
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  return (
    <div className="stack gap-4">
      <HeaderCard
        title="Places"
        subtitle="A home, an office, a car — anything with stuff in it."
        sticker={stickers.house}
        accent={stickers.pin}
      >
        {/* Desktop only — on phones the floating + button does this. */}
        <Button
          variant="primary" onClick={() => setCreating(true)} className="hide-mobile"
          style={{ alignSelf: 'flex-start' }}
        >
          <PlusIcon size={16} />
          New place
        </Button>
      </HeaderCard>

      {isLoading ? (
        <SkeletonList rows={3} height={150} />
      ) : isError ? (
        <ErrorAlert message={toMessage(error)} />
      ) : data?.length ? (
        <div className="list">
          {data.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<BoxIcon size={24} />}
          title="No places yet"
          description="Start with where you live. You can add rooms and cupboards inside it afterwards."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <PlusIcon size={16} />
              Add your first place
            </Button>
          }
        />
      )}

      <button className="fab" onClick={() => setCreating(true)} aria-label="New place">
        <PlusIcon size={24} />
      </button>

      <PlaceFormModal
        open={creating}
        onClose={() => setCreating(false)}
        submitting={createPlace.isPending}
        onSubmit={async (dto) => {
          try {
            await createPlace.mutateAsync(dto);
            toast.success('Place created.');
            setCreating(false);
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />
    </div>
  );
}
