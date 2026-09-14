import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import './ui.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'dashed';
type Size = 'sm' | 'md' | 'lg';

const classes = (variant: Variant, size: Size, block?: boolean, icon?: boolean) =>
  ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', icon && 'btn-icon']
    .filter(Boolean)
    .join(' ');

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  iconOnly?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, iconOnly, loading, disabled, children, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[classes(variant, size, block, iconOnly), className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner size={15} />}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  iconOnly?: boolean;
}

export function ButtonLink({
  variant = 'secondary', size = 'md', block, iconOnly, className, ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={[classes(variant, size, block, iconOnly), className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="center-fill" role="status">
      <div className="stack gap-3" style={{ alignItems: 'center' }}>
        <Spinner size={26} />
        <span className="text-sm text-muted">{label}</span>
      </div>
    </div>
  );
}
