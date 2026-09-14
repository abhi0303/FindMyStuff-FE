import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePlace, useStorageList } from '@/hooks/queries';
import { Button, LoadingBlock } from '@/components/ui/Button';
import { Alert, EmptyState, ErrorAlert } from '@/components/ui/Feedback';
import { QrCode } from '@/components/QrCode';
import { ArrowLeft, PrinterIcon, QrIcon } from '@/components/Icons';
import { toMessage } from '@/api/errors';
import { pluralize } from '@/lib/format';
import './Screens.css';

/**
 * A printable sheet of QR stickers for every container in a place. Scanning one
 * opens /scan/<labelCode>, which lists what is inside — the point of the whole
 * feature for cartons, suitcases and loft boxes.
 */
export default function LabelSheetScreen() {
  const { placeId = '' } = useParams();
  const place = usePlace(placeId);
  const storages = useStorageList(placeId);
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const rows = useMemo(() => storages.data ?? [], [storages.data]);
  const chosen = selected ? rows.filter((s) => selected.has(s.id)) : rows;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev ?? rows.map((r) => r.id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (storages.isLoading) return <LoadingBlock />;

  return (
    <div className="stack gap-4">
      <div className="no-print stack gap-4">
        <Link to={`/places/${placeId}`} className="back-link">
          <ArrowLeft size={15} /> {place.data?.name ?? 'Place'}
        </Link>

        <div className="page-head">
          <div>
            <h1>Label sheet</h1>
            <p className="text-muted text-sm">
              Print, cut, and stick one on each box. {pluralize(chosen.length, 'label')} selected.
            </p>
          </div>
          <Button variant="primary" onClick={() => window.print()} disabled={chosen.length === 0}>
            <PrinterIcon size={16} /> Print
          </Button>
        </div>

        {storages.isError && <ErrorAlert message={toMessage(storages.error)} />}

        {rows.length > 0 && (
          <>
            <Alert kind="info">
              Print at 100% scale (no “fit to page”) so the codes stay sharp. Three per row on A4.
            </Alert>

            <div className="card card-pad stack gap-2">
              <div className="row between">
                <span className="section-title">Which storages?</span>
                <div className="row gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(rows.map((r) => r.id)))}>
                    All
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>None</Button>
                </div>
              </div>

              <div className="stack gap-1" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {rows.map((storage) => (
                  <label key={storage.id} className="checkbox-row" style={{ padding: '4px 0' }}>
                    <input
                      type="checkbox"
                      checked={selected ? selected.has(storage.id) : true}
                      onChange={() => toggle(storage.id)}
                    />
                    <span className="stack" style={{ minWidth: 0 }}>
                      <span className="text-sm semibold truncate">{storage.name}</span>
                      <span className="text-xs text-subtle truncate">{storage.breadcrumb}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {chosen.length > 0 ? (
        <div className="label-sheet">
          {chosen.map((storage) => (
            <div key={storage.id} className="label-tile">
              <QrCode value={storage.labelCode} size={110} />
              <span className="label-name">{storage.name}</span>
              <span className="label-crumb">{storage.breadcrumb}</span>
              <span className="label-code">{storage.labelCode}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-print">
          <EmptyState
            icon={<QrIcon size={24} />}
            title={rows.length ? 'Nothing selected' : 'No storages to label'}
            description={
              rows.length
                ? 'Pick at least one storage above.'
                : 'Add a room or a box to this place first — each one gets its own code.'
            }
          />
        </div>
      )}
    </div>
  );
}
