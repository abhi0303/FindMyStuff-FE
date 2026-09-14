import { useEffect, useState } from 'react';

/**
 * Storage label codes (FMS-3TSCQ8) render straight into a QR sticker. The alphabet
 * has no I, L, O or U so the code stays unambiguous when read off a printed label.
 */
export function QrCode({
  value, size = 160, className,
}: { value: string; size?: number; className?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Loaded on demand — most sessions never open a QR view, and this keeps the
    // encoder out of the initial bundle.
    void import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(value, {
      width: size * 2, // 2× for crisp printing
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }))
      .then((url) => active && setDataUrl(url))
      .catch(() => active && setDataUrl(null));
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return <div className={`skeleton ${className ?? ''}`} style={{ width: size, height: size }} aria-hidden />;
  }

  return (
    <img
      src={dataUrl}
      alt={`QR code for ${value}`}
      width={size}
      height={size}
      className={className}
      // Always on white — a QR code on a dark background will not scan.
      style={{ background: '#fff', borderRadius: 6, padding: 4 }}
    />
  );
}
