import { Link, NavLink } from 'react-router';
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

/**
 * Tabs that are links: each tab is its own address, so it can be bookmarked and the
 * browser's back button works. `tabs` are `{ to, label, end }`.
 */
export function LinkTabs({ label, tabs, className }) {
  return (
    <nav aria-label={label} className={cn('mb-6 border-b border-line', className)}>
      <ul className="-mb-px flex gap-6">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-10 items-center border-b-2 text-body font-medium transition-colors duration-150',
                  isActive
                    ? 'border-accent text-ink'
                    : 'border-transparent text-ink-2 hover:text-ink',
                )
              }
            >
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
