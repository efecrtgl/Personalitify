import {
  CalendarDays,
  ChartColumn,
  House,
  ListTodo,
  NotebookPen,
  Repeat,
  Settings,
  Smile,
  Target,
  Timer,
} from 'lucide-react';

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
  { to: '/analytics', labelKey: 'common:nav.analytics', icon: ChartColumn },
  { to: '/focus', labelKey: 'common:nav.focus', icon: Timer },
  { to: '/journal', labelKey: 'common:nav.journal', icon: NotebookPen },
  { to: '/mood', labelKey: 'common:nav.mood', icon: Smile },
];

export const secondaryNavigation = [
  { to: '/settings', labelKey: 'common:nav.settings', icon: Settings },
];
