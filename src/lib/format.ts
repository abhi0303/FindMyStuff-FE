/** All API timestamps are UTC ISO 8601 — everything here converts for display. */

const DAY = 24 * 60 * 60 * 1000;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** "in 3 days" / "2 hours ago" — falls back to a date beyond a month. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const diff = then - Date.now();
  const abs = Math.abs(diff);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * DAY) return rtf.format(Math.round(diff / DAY), 'day');
  return formatDate(iso);
}

/** Whole days from now; negative means overdue. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / DAY);
}

/** For <input type="date"> — the API wants full ISO back. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromDateInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Comma/enter separated free text → a clean lowercase list (server lowercases too). */
export function parseList(value: string): string[] {
  return [...new Set(value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
}
