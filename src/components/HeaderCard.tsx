import type { ReactNode } from 'react';
import '@/routes/Screens.css';

interface HeaderCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Main sticker on the right. Decorative — the title and subtitle carry the meaning. */
  sticker: string;
  /** Small sticker tucked beside the main one. */
  accent?: string;
  /** Anything that belongs inside the card below the title row (a search box, a button). */
  children?: ReactNode;
}

/** The soft page header card used on Home, Places and Scan. */
export function HeaderCard({ title, subtitle, sticker, accent, children }: HeaderCardProps) {
  return (
    <header className="header-card">
      <div className="header-card-top">
        <div className="stack" style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          {subtitle && <p className="page-meta">{subtitle}</p>}
        </div>

        <div className="header-sticker" aria-hidden>
          {/* Keyed by source so a swapped sticker plays its entrance again. */}
          <img key={sticker} src={sticker} alt="" className="header-sticker-main" />
          {accent && <img src={accent} alt="" className="header-sticker-accent" />}
        </div>
      </div>

      {children}
    </header>
  );
}
