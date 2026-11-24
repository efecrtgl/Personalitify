import { Link } from 'react-router';
import { cn } from '../lib/cn.js';
import { buttonClassName } from './Button.jsx';

/** A navigation link with the appearance of a button. */
export function LinkButton({
  to,
  variant,
  size,
  fullWidth,
  icon: Icon,
  className,
  children,
  ...props
}) {
  return (
    <Link
      to={to}
      className={cn(buttonClassName({ variant, size, fullWidth }), className)}
      {...props}
    >
      {Icon && <Icon className="size-4" aria-hidden="true" />}
      {children}
    </Link>
  );
}
