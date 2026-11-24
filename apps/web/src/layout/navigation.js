import { CalendarDays, House, ListTodo, Repeat, Settings, Target } from 'lucide-react';

/**
 * Primary navigation. Each module adds its entry here when it ships, so the sidebar never
 * links to a screen that does not exist.
 */
export const primaryNavigation = [
  { to: '/', labelKey: 'common:nav.home', icon: House, end: true },
  { to: '/habits', labelKey: 'common:nav.habits', icon: Repeat },
  { to: '/tasks', labelKey: 'common:nav.tasks', icon: ListTodo },
  { to: '/goals', labelKey: 'common:nav.goals', icon: Target },
  { to: '/calendar', labelKey: 'common:nav.calendar', icon: CalendarDays },
];

export const secondaryNavigation = [
  { to: '/settings', labelKey: 'common:nav.settings', icon: Settings },
];
