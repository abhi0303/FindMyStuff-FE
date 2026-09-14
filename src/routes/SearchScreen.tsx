import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePlaces, useSearch } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import type { SearchItemResult } from '@/api/types';
import { AuthImage } from '@/components/ui/AuthImage';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorAlert, SkeletonList } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ItemRow';
import { BoxIcon, ChevronRight, SearchIcon, StorageIcon, XIcon } from '@/components/Icons';
import { illustrations } from '@/assets/illustrations';
import { toMessage } from '@/api/errors';
import { pluralize } from '@/lib/format';
import './Screens.css';

export default function SearchScreen() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [placeId, setPlaceId] = useState<string | undefined>(() => params.get('placeId') ?? undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // ~250ms is the sweet spot: fast enough to feel live, slow enough not to
  // fire a request per keystroke. Below 2 characters we do not search at all.
  const debounced = useDebounced(query, 250);
  const active = debounced.trim().length >= 2;

  const places = usePlaces();
  const { data, isLoading, isFetching, isError, error } = useSearch(debounced.trim(), placeId, active);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the URL shareable/restorable without pushing a history entry per keystroke.
  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced.trim()) next.set('q', debounced.trim());
    if (placeId) next.set('placeId', placeId);
    setParams(next, { replace: true });
  }, [debounced, placeId, setParams]);

  const hasResults = Boolean(data && (data.items.length > 0 || data.storages.length > 0));

  return (
    <div className="stack gap-3">
      <div className="search-hero">
        <div className="search-input-wrap">
          <SearchIcon size={17} className="search-input-icon" />
          <input
            ref={inputRef}
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="charger, passport, medicine…"
            aria-label="Search your things"
            autoComplete="off"
            enterKeyHint="search"
          />
          {query && (
            <Button
              variant="ghost" size="sm" iconOnly className="search-input-clear"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <XIcon size={15} />
            </Button>
          )}
        </div>

        {places.data && places.data.length > 1 && (
          <div className="segmented">
            <button aria-pressed={!placeId} onClick={() => setPlaceId(undefined)}>Everywhere</button>
            {places.data.map((place) => (
              <button key={place.id} aria-pressed={placeId === place.id} onClick={() => setPlaceId(place.id)}>
                {place.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {!active ? (
        <EmptyState
          illustration={illustrations.searching}
          title="What are you looking for?"
          description="Search by what you call it — “charger” finds the Type-C cable. Typos are fine."
        />
      ) : isLoading ? (
        <SkeletonList rows={4} height={56} />
      ) : isError ? (
        <ErrorAlert message={toMessage(error)} />
      ) : !hasResults ? (
        <EmptyState
          illustration={illustrations.noResults}
          title={`Nothing found for “${debounced.trim()}”`}
          description="Try a shorter word, or add that name as an alias on the thing once you find it."
        />
      ) : (
        <div className="stack gap-5" style={{ opacity: isFetching ? 0.65 : 1, transition: 'opacity 0.15s' }}>
          {data!.items.length > 0 && (
            <section className="stack gap-1">
              <h2 className="section-title">{pluralize(data!.meta.total, 'thing')}</h2>
              {/* Results arrive pre-sorted by score — never re-sort them. */}
              <div className="list">
                {data!.items.map((item) => (
                  <ResultRow key={item.id} result={item} query={debounced.trim()} />
                ))}
              </div>
            </section>
          )}

          {data!.storages.length > 0 && (
            <section className="stack gap-1">
              <h2 className="section-title">Places to look</h2>
              <div className="list">
                {data!.storages.map((storage) => (
                  <Link
                    key={storage.id}
                    to={`/places/${storage.place.id}/storages/${storage.id}`}
                    className="item-row"
                  >
                    <span className="icon-tile" aria-hidden><StorageIcon type={storage.type} size={18} /></span>
                    <span className="item-main">
                      <span className="item-name truncate">{storage.name}</span>
                      <span className="item-meta truncate">{storage.breadcrumb}</span>
                    </span>
                    {storage.itemCount > 0 && <span className="item-count">{storage.itemCount}</span>}
                    <ChevronRight size={16} className="row-chevron" />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ result, query }: { result: SearchItemResult; query: string }) {
  // If the hit came from an alias rather than the name, say so — it explains why
  // "charger" returned something called "Type-C cable".
  const matchedAlias = result.aliases.find((alias) => alias.includes(query.toLowerCase()));
  const nameMatches = result.name.toLowerCase().includes(query.toLowerCase());

  return (
    <Link to={`/places/${result.place.id}/items/${result.id}`} className="result-row">
      <AuthImage
        mediaId={result.mediaId}
        alt=""
        className="item-thumb"
        fallback={<span className="icon-tile" aria-hidden><BoxIcon size={18} /></span>}
      />

      <span className="grow stack gap-1" style={{ minWidth: 0 }}>
        {/* The breadcrumb already includes the place name and is the whole answer. */}
        <span className="result-where">{result.storage?.breadcrumb ?? `${result.place.name} · not put away yet`}</span>

        <span className="result-what row gap-2 wrap">
          <span className="truncate">
            {result.name}
            {result.quantity > 1 && <span> ×{result.quantity}</span>}
          </span>
          <StatusBadge status={result.status} />
        </span>

        {matchedAlias && !nameMatches && (
          <span className="text-xs text-subtle">
            also called <span className="alias-hit">{matchedAlias}</span>
          </span>
        )}
      </span>
    </Link>
  );
}
