import { JOURNAL_KINDS } from '@personalitify/shared-contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { NotebookPen, Pin, Plus, Search, StickyNote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { cn } from '../../lib/cn.js';
import { useFormat } from '../../lib/format.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Card, PageHeader } from '../../ui/display.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../../ui/feedback.jsx';
import { Input, SegmentedControl } from '../../ui/fields.jsx';
import { LinkButton } from '../../ui/LinkButton.jsx';

const PAGE_SIZE = 20;

/** The value of `value`, `delay` milliseconds after it last changed. */
function useDebounced(value, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return settled;
}

function EntryCard({ entry }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { settings } = useAuth();
  const Icon = entry.kind === 'note' ? StickyNote : NotebookPen;
  return (
    <li>
      <Card as="article" className="relative p-5 transition-shadow hover:shadow-raised">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-heading font-semibold text-ink">
              <Link
                to={`/journal/${entry.id}`}
                className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent"
              >
                {entry.title || t('journal:list.untitled')}
              </Link>
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-ink-2">
              <span>{format.calendarWeekdayDate(entry.date)}</span>
              <span aria-hidden="true">·</span>
              <span>{t('journal:list.words', { count: entry.wordCount })}</span>
              {entry.pinned && (
                <span className="inline-flex items-center gap-1 font-medium text-accent">
                  <Pin className="size-3.5" aria-hidden="true" />
                  {t('journal:list.pinned')}
                </span>
              )}
            </p>
            {entry.excerpt ? (
              <p className="mt-2 line-clamp-3 text-body text-ink-2">
                {entry.excerpt}
                {entry.truncated && '…'}
              </p>
            ) : (
              settings.privacy.hideSensitivePreviews &&
              entry.wordCount > 0 && (
                <p className="mt-2 text-caption text-ink-3">{t('journal:list.hiddenPreview')}</p>
              )
            )}
            {entry.tags.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full bg-surface-2 px-2 py-0.5 text-caption text-ink-2"
                  >
                    {t('journal:tags.tag', { tag })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}

export function JournalPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [text, setText] = useState(searchParams.get('q') ?? '');
  const q = useDebounced(text.trim());

  const requestedKind = searchParams.get('kind');
  const kind = JOURNAL_KINDS.includes(requestedKind) ? requestedKind : 'all';
  const tag = searchParams.get('tag') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const change = (changes) => {
    const next = { kind, tag, page: 1, ...changes };
    setSearchParams(
      {
        ...(next.kind === 'all' ? {} : { kind: next.kind }),
        ...(next.tag ? { tag: next.tag } : {}),
        ...(next.page > 1 ? { page: String(next.page) } : {}),
      },
      { replace: true },
    );
  };

  const filter = {
    ...(kind === 'all' ? {} : { kind }),
    ...(tag ? { tag } : {}),
    ...(q ? { q } : {}),
    page: q ? 1 : page,
    limit: PAGE_SIZE,
  };
  const entries = useQuery({
    queryKey: queryKeys.journal.list(filter),
    queryFn: () => api.journal.list(filter),
    placeholderData: keepPreviousData,
  });
  const tags = useQuery({ queryKey: queryKeys.journal.tags, queryFn: () => api.journal.tags() });

  const items = entries.data?.items ?? [];
  const meta = entries.data?.meta;
  const filtered = Boolean(q || tag || kind !== 'all');

  return (
    <>
      <PageHeader
        title={t('journal:title')}
        description={t('journal:description')}
        actions={
          <>
            <LinkButton to="/journal/new?kind=note" icon={StickyNote}>
              {t('journal:new.note')}
            </LinkButton>
            <LinkButton to="/journal/new" variant="primary" icon={Plus}>
              {t('journal:new.journal')}
            </LinkButton>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={t('journal:search.label')}
            placeholder={t('journal:search.placeholder')}
            value={text}
            maxLength={100}
            onChange={(event) => setText(event.target.value)}
            className="w-full pl-9"
          />
        </div>
        <SegmentedControl
          label={t('journal:kindLabel')}
          value={kind}
          onChange={(value) => change({ kind: value })}
          options={['all', ...JOURNAL_KINDS].map((value) => ({
            value,
            label: t(`journal:kind.${value}`),
          }))}
        />
      </div>

      {(tags.data?.length ?? 0) > 0 && (
        <div
          role="group"
          aria-label={t('journal:tags.label')}
          className="mb-5 flex flex-wrap gap-1.5"
        >
          {tags.data.slice(0, 24).map((row) => {
            const active = row.tag === tag;
            return (
              <button
                key={row.tag}
                type="button"
                aria-pressed={active}
                onClick={() => change({ tag: active ? '' : row.tag })}
                className={cn(
                  'h-8 rounded-full px-3 text-caption font-medium transition-colors',
                  active
                    ? 'bg-accent text-on-accent'
                    : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink',
                )}
              >
                {t('journal:tags.tagCount', row)}
              </button>
            );
          })}
        </div>
      )}

      {entries.isPending ? (
        <SkeletonList rows={4} />
      ) : entries.isError ? (
        <ErrorState description={errorMessage(entries.error)} onRetry={entries.refetch} />
      ) : items.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState
              icon={Search}
              title={t('journal:list.noResultsTitle')}
              description={t('journal:list.noResultsDescription')}
              action={
                <Button
                  onClick={() => {
                    setText('');
                    change({ kind: 'all', tag: '' });
                  }}
                >
                  {t('journal:list.clearFilters')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={NotebookPen}
              title={t('journal:list.emptyTitle')}
              description={t('journal:list.emptyDescription')}
              action={
                <LinkButton to="/journal/new" variant="primary" icon={Plus}>
                  {t('journal:new.journal')}
                </LinkButton>
              }
            />
          )}
        </Card>
      ) : (
        <>
          {q && (
            <p role="status" className="mb-3 text-caption text-ink-2">
              {t('journal:search.results', { count: meta.total })}
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {items.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </ul>
          {meta.totalPages > 1 && (
            <nav className="mt-5 flex items-center justify-between gap-3">
              <Button disabled={meta.page <= 1} onClick={() => change({ page: meta.page - 1 })}>
                {t('common:previous')}
              </Button>
              <span className="text-caption text-ink-2">
                {t('common:pageOf', { page: meta.page, total: meta.totalPages })}
              </span>
              <Button
                disabled={meta.page >= meta.totalPages}
                onClick={() => change({ page: meta.page + 1 })}
              >
                {t('common:next')}
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
