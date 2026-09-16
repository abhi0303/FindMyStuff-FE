/**
 * The FindMyStuff mark: a box inside a magnifying glass.
 *
 * Drawn in `currentColor` so it takes the colour of whatever it sits in — the tinted tile in
 * the header and on the auth screens. The app icons use the same shape in two colours.
 */
export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      <circle cx="10" cy="10" r="6.2" strokeWidth="2" />
      <path d="M14.6 14.6 20.2 20.2" strokeWidth="2.6" />
      <path d="M10 6.6 13.4 8.4 10 10.2 6.6 8.4Z" strokeWidth="1.5" />
      <path d="M6.6 8.4V12l3.4 1.8v-3.6M13.4 8.4V12l-3.4 1.8" strokeWidth="1.5" />
    </svg>
  );
}
