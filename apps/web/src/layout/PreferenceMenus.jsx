import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from '@personalitify/localization';
import { Languages, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUpdateSettings } from '../hooks/useAccount.js';
import { setLanguage } from '../lib/i18n.js';
import { useAuth } from '../providers/AuthProvider.jsx';
import { useTheme } from '../providers/ThemeProvider.jsx';
import { IconButton } from '../ui/Button.jsx';
import { Menu } from '../ui/overlays.jsx';

export const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };

/**
 * Applies a preference locally at once and, when signed in, stores it in the account so it
 * follows the user to their other devices.
 */
export function usePreferenceSetters() {
  const { status } = useAuth();
  const { setPreference } = useTheme();
  const updateSettings = useUpdateSettings({ silent: true });
  const signedIn = status === 'authenticated';

  return {
    setTheme(theme) {
      setPreference(theme);
      if (signedIn) updateSettings.mutate({ theme });
    },
    setLanguage(language) {
      setLanguage(language);
      if (signedIn) updateSettings.mutate({ language });
    },
  };
}

export function ThemeMenu() {
  const { t } = useTranslation();
  const { preference, resolved } = useTheme();
  const { setTheme } = usePreferenceSetters();

  return (
    <Menu
      label={t('common:theme.label')}
      trigger={<IconButton icon={THEME_ICONS[resolved]} label={t('common:theme.label')} />}
      items={['system', 'light', 'dark'].map((theme) => ({
        id: theme,
        label: t(`common:theme.${theme}`),
        icon: THEME_ICONS[theme],
        selected: preference === theme,
        onSelect: () => setTheme(theme),
      }))}
    />
  );
}

export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const setters = usePreferenceSetters();

  return (
    <Menu
      label={t('common:language.label')}
      trigger={<IconButton icon={Languages} label={t('common:language.label')} />}
      items={SUPPORTED_LANGUAGES.map((language) => ({
        id: language,
        label: LANGUAGE_NAMES[language],
        selected: i18n.language === language,
        onSelect: () => setters.setLanguage(language),
      }))}
    />
  );
}
