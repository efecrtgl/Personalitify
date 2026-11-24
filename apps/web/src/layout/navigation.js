import { House, Repeat, Settings } from 'lucide-react';

/**
 * Primary navigation. Each module adds its entry here when it ships, so the sidebar never
 * links to a screen that does not exist.
 */
export const primaryNavigation = [
  { to: '/', labelKey: 'common:nav.home', icon: House, end: true },
  { to: '/habits', labelKey: 'common:nav.habits', icon: Repeat },
];

export const secondaryNavigation = [
  { to: '/settings', labelKey: 'common:nav.settings', icon: Settings },
];
