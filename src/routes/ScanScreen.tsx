import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { useStorageByLabel } from '@/hooks/queries';
import { Button, ButtonLink, LoadingBlock } from '@/components/ui/Button';
import { Alert, Badge, EmptyState, ErrorAlert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { Breadcrumb } from '@/components/Breadcrumb';
import { ItemRow } from '@/components/ItemRow';
import { ArrowLeft, ChevronRight, QrIcon, ScanIcon, StorageIcon } from '@/components/Icons';
import { storageTypeLabel } from '@/lib/labels';
import { illustrations } from '@/assets/illustrations';
import { stickers } from '@/assets/stickers';
import { HeaderCard } from '@/components/HeaderCard';
import { pluralize } from '@/lib/format';
import './Screens.css';

/** Label codes look like FMS-3TSCQ8; invites like INV-ZJ5Y0YAP. Pull either out of
    whatever the camera decoded — a bare code, a deep link, or a full URL. */
function extractCode(raw: string): { kind: 'label' | 'invite'; code: string } | null {
  const text = raw.trim().toUpperCase();
  const label = text.match(/FMS-[A-Z0-9]{4,12}/);
  if (label) return { kind: 'label', code: label[0] };
  const invite = text.match(/INV-[A-Z0-9]{4,12}/);
  if (invite) return { kind: 'invite', code: invite[0] };
  return null;
}

export default function ScanScreen() {
  const { labelCode } = useParams();
  const navigate = useNavigate();

  const [manual, setManual] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const storage = useStorageByLabel(labelCode);

  const handleCode = useCallback(
    (raw: string) => {
      const found = extractCode(raw);
      if (!found) return false;
      if (found.kind === 'invite') navigate(`/invite/${found.code}`);
      else navigate(`/scan/${found.code}`);
      return true;
    },
    [navigate],
  );

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    setCameraError(null);
    setScanning(true);
    try {
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined, // let the browser pick; it prefers the rear camera on phones
        videoRef.current ?? undefined,
        (result) => {
          if (!result) return;
          if (handleCode(result.getText())) stop();
        },
      );
    } catch (error) {
      setScanning(false);
      setCameraError(
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow it in your browser settings, or type the code below.'
          : 'Could not start the camera. Type the code below instead.',
      );
    }
  }, [handleCode, stop]);

  // Always release the camera when leaving the screen.
  useEffect(() => stop, [stop]);

  /* ---------------- a code has been scanned ---------------- */
  if (labelCode) {
    if (storage.isLoading) return <LoadingBlock label="Looking up that label…" />;

    if (storage.isError) {
      return (
        <EmptyState
          illustration={illustrations.noResults}
          title={`Nothing found for ${labelCode}`}
          description="That label doesn't match any storage you can see. Check the code, or ask whoever owns it to share the place with you."
          action={<ButtonLink to="/scan" variant="primary" replace>Scan another</ButtonLink>}
        />
      );
    }

    const data = storage.data!;
    return (
      <div className="stack gap-4">
        <Link to="/scan" className="back-link" replace><ArrowLeft size={15} /> Scan another</Link>

        <header className="page-header">
          <span className="icon-tile icon-tile-lg" aria-hidden><StorageIcon type={data.type} size={22} /></span>
          <div className="stack grow" style={{ minWidth: 0 }}>
            <h1 className="clamp-2">{data.name}</h1>
            <div className="meta-line">
              <Badge tone="neutral"><span className="mono">{data.labelCode}</span></Badge>
              <span className="page-meta truncate"><Breadcrumb value={data.breadcrumb} emphasizeLast={false} /></span>
            </div>
          </div>
        </header>

        {data.children.length > 0 && (
          <section className="stack gap-1">
            <div className="section-head"><h2 className="section-title">Inside this</h2></div>
            <div className="list">
              {data.children.map((child) => (
                <Link key={child.id} to={`/places/${data.placeId}/storages/${child.id}`} className="item-row">
                  <span className="icon-tile" aria-hidden><StorageIcon type={child.type} size={18} /></span>
                  <span className="item-main">
                    <span className="item-name truncate">{child.name}</span>
                    <span className="item-meta">{storageTypeLabel(child.type)}</span>
                  </span>
                  <ChevronRight size={16} className="row-chevron" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="stack gap-1">
          <div className="section-head">
            <h2 className="section-title">
              {data.items.length > 0 ? pluralize(data.items.length, 'thing') : 'Things here'}
            </h2>
          </div>
          {data.items.length > 0 ? (
            <div className="list">
              {data.items.map((item) => (
                <ItemRow key={item.id} item={item} placeId={data.placeId} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-subtle">Nothing recorded in here yet.</p>
          )}
        </section>

        <ButtonLink to={`/places/${data.placeId}/storages/${data.id}`} variant="secondary" block>
          Open in the full view
        </ButtonLink>
      </div>
    );
  }

  /* ---------------- scanning ---------------- */
  return (
    <div className="stack gap-4">
      <HeaderCard
        title="Scan a label"
        subtitle="Point the camera at a sticker to see what’s inside — no need to open the box."
        sticker={stickers.phone}
        accent={stickers.magnifier}
      />

      <ErrorAlert message={cameraError} />

      <div className="scanner-frame">
        <video ref={videoRef} muted playsInline />
        {scanning && <div className="scanner-reticle" aria-hidden />}
        {!scanning && (
          <div className="scanner-idle">
            <QrIcon size={40} strokeWidth={1.25} />
            <Button variant="secondary" onClick={start}>
              <ScanIcon size={16} /> Start camera
            </Button>
          </div>
        )}
      </div>

      {scanning && (
        <Button variant="secondary" block onClick={stop}>Stop camera</Button>
      )}

      <form
        className="stack gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!handleCode(manual)) setCameraError('That doesn’t look like a FindMyStuff code.');
        }}
      >
        <Input
          label="Or type the code"
          value={manual}
          onChange={(e) => setManual(e.target.value.toUpperCase())}
          placeholder="FMS-3TSCQ8"
          className="mono"
          autoCapitalize="characters"
          autoComplete="off"
        />
        <Button type="submit" variant="primary" disabled={!manual.trim()}>Look it up</Button>
      </form>

      <Alert kind="info">
        Codes use an alphabet without I, L, O or U, so there’s nothing ambiguous to mistype.
      </Alert>
    </div>
  );
}
