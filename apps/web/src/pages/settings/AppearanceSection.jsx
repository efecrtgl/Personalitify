import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from '@personalitify/localization';
import { useTranslation } from 'react-i18next';
import { THEME_ICONS, usePreferenceSetters } from '../../layout/PreferenceMenus.jsx';
import { useTheme } from '../../providers/ThemeProvider.jsx';
import { Panel, Row } from '../../ui/display.jsx';
import { SegmentedControl, Select } from '../../ui/fields.jsx';

export function AppearanceSection() {
  const { t, i18n } = useTranslation();
  const { preference } = useTheme();
  const { setTheme, setLanguage } = usePreferenceSetters();

  return (
    <Panel
      title={t('settings:appearance.title')}
      description={t('settings:appearance.description')}
    >
      <Row
        title={t('settings:appearance.theme')}
        description={t('settings:appearance.themeDescription')}
      >
        <SegmentedControl
          label={t('settings:appearance.theme')}
          value={preference}
          onChange={setTheme}
          options={['system', 'light', 'dark'].map((theme) => ({
            value: theme,
            label: t(`common:theme.${theme}`),
            icon: THEME_ICONS[theme],
          }))}
        />
      </Row>
      <Row
        title={t('settings:appearance.language')}
        description={t('settings:appearance.languageDescription')}
      >
        <Select
          aria-label={t('settings:appearance.language')}
          value={i18n.language}
          onChange={(event) => setLanguage(event.target.value)}
          options={SUPPORTED_LANGUAGES.map((language) => ({
            value: language,
            label: LANGUAGE_NAMES[language],
          }))}
          className="min-w-40"
        />
      </Row>
    </Panel>
  );
}
