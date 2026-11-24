import { DATE_FORMATS, TIME_FORMATS, WEEK_STARTS } from '@personalitify/shared-contracts';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateSettings } from '../../hooks/useAccount.js';
import { browserTimeZone } from '../../lib/device.js';
import { useFormat } from '../../lib/format.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Panel, Row } from '../../ui/display.jsx';
import { Banner } from '../../ui/feedback.jsx';
import { SegmentedControl, Select } from '../../ui/fields.jsx';

/** Time zones the browser knows, always including the one currently saved. */
function useTimeZoneOptions(current) {
  return useMemo(() => {
    // Older browsers lack Intl.supportedValuesOf; the saved zone and UTC remain selectable.
    const zones =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    const all = new Set([...zones, 'UTC', current].filter(Boolean));
    return [...all].sort().map((zone) => ({ value: zone, label: zone.replaceAll('_', ' ') }));
  }, [current]);
}

export function RegionSection() {
  const { t } = useTranslation();
  const { settings } = useAuth();
  const update = useUpdateSettings();
  const format = useFormat();
  const timeZones = useTimeZoneOptions(settings.timeZone);
  const detected = browserTimeZone();
  const now = new Date();

  return (
    <Panel title={t('settings:region.title')} description={t('settings:region.description')}>
      {detected && detected !== settings.timeZone && (
        <Banner
          tone="info"
          className="mb-5"
          action={
            <Button size="sm" onClick={() => update.mutate({ timeZone: detected })}>
              {t('settings:region.useDetected')}
            </Button>
          }
        >
          {t('settings:region.detected', { zone: detected.replaceAll('_', ' ') })}
        </Banner>
      )}
      <Row
        title={t('settings:region.timeZone')}
        description={t('settings:region.timeZoneDescription')}
      >
        <Select
          aria-label={t('settings:region.timeZone')}
          value={settings.timeZone}
          onChange={(event) => update.mutate({ timeZone: event.target.value })}
          options={timeZones}
          className="w-64 max-w-full"
        />
      </Row>
      <Row
        title={t('settings:region.dateFormat')}
        description={t('settings:region.preview', { value: format.numericDate(now) })}
      >
        <SegmentedControl
          label={t('settings:region.dateFormat')}
          value={settings.dateFormat}
          onChange={(dateFormat) => update.mutate({ dateFormat })}
          options={DATE_FORMATS.map((value) => ({
            value,
            label: t(`settings:region.dateFormats.${value}`),
          }))}
        />
      </Row>
      <Row
        title={t('settings:region.timeFormat')}
        description={t('settings:region.preview', { value: format.time(now) })}
      >
        <SegmentedControl
          label={t('settings:region.timeFormat')}
          value={settings.timeFormat}
          onChange={(timeFormat) => update.mutate({ timeFormat })}
          options={TIME_FORMATS.map((value) => ({
            value,
            label: t(`settings:region.timeFormats.${value}`),
          }))}
        />
      </Row>
      <Row
        title={t('settings:region.weekStart')}
        description={t('settings:region.weekStartDescription')}
      >
        <Select
          aria-label={t('settings:region.weekStart')}
          value={settings.weekStart}
          onChange={(event) => update.mutate({ weekStart: Number(event.target.value) })}
          options={WEEK_STARTS.map((day) => ({
            value: day,
            label: t(`common:weekdays.${day}`),
          }))}
          className="min-w-40"
        />
      </Row>
    </Panel>
  );
}
