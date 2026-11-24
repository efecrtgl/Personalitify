import { JOURNAL_LIMITS } from '@personalitify/shared-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, History, Pin, PinOff, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { currentDateInZone } from '../../lib/dates.js';
import { useFormat } from '../../lib/format.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Card } from '../../ui/display.jsx';
import { ErrorState, Skeleton } from '../../ui/feedback.jsx';
import { Field, Input, SegmentedControl, Textarea } from '../../ui/fields.jsx';
import { LinkButton } from '../../ui/LinkButton.jsx';
import { Markdown } from '../../ui/Markdown.jsx';
import { ConfirmDialog, Modal } from '../../ui/overlays.jsx';
import { useToast } from '../../ui/toast.jsx';

/** Tags as typed ("iş, #spor sağlık") to a list. */
const parseTags = (text) => [
  ...new Set(
    text
      .split(/[\s,]+/)
      .map((tag) => tag.replace(/^#+/, ''))
      .filter(Boolean),
  ),
];

function RevisionsDialog({ entryId, onClose, onRestored }) {
  const { t } = useTranslation();
  const format = useFormat();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const revisions = useQuery({
    queryKey: queryKeys.journal.revisions(entryId),
    queryFn: () => api.journal.revisions(entryId),
  });
  const restore = useMutation({
    mutationFn: (revisionId) => api.journal.restoreRevision(entryId, revisionId),
    onSuccess: (entry) => {
      toast.success(t('journal:revisions.restored'));
      onRestored(entry);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('journal:revisions.title')}
      description={t('journal:revisions.description', { max: JOURNAL_LIMITS.revisions })}
    >
      {revisions.isPending ? (
        <Skeleton className="h-24 rounded-control" />
      ) : revisions.isError ? (
        <ErrorState description={errorMessage(revisions.error)} onRetry={revisions.refetch} />
      ) : revisions.data.length === 0 ? (
        <p className="py-4 text-center text-body text-ink-2">{t('journal:revisions.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {revisions.data.map((revision) => (
            <li key={revision.id} className="rounded-control bg-surface-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption text-ink-2">
                  {t('journal:revisions.replacedAt', {
                    date: format.dateTime(revision.replacedAt),
                  })}
                </p>
                <Button
                  size="sm"
                  loading={restore.isPending && restore.variables === revision.id}
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(revision.id)}
                >
                  {t('journal:revisions.restore')}
                </Button>
              </div>
              <p className="mt-2 text-body font-medium text-ink">
                {revision.title || t('journal:list.untitled')}
              </p>
              <p className="mt-1 line-clamp-4 text-body whitespace-pre-wrap text-ink-2">
                {revision.body || t('journal:revisions.emptyBody')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** The editor itself. Remounted for another entry or after the stored one was replaced. */
function Editor({ entry, kind }) {
  const { t } = useTranslation();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { settings } = useAuth();

  const [title, setTitle] = useState(entry?.title ?? '');
  const [date, setDate] = useState(entry?.date ?? currentDateInZone(settings.timeZone));
  const [tagsText, setTagsText] = useState((entry?.tags ?? []).join(' '));
  const [body, setBody] = useState(entry?.body ?? '');
  const [mode, setMode] = useState('write');
  const [dialog, setDialog] = useState(null);

  const tags = parseTags(tagsText);
  const tagsError =
    tags.length > JOURNAL_LIMITS.tags
      ? t('journal:editor.tooManyTags', { max: JOURNAL_LIMITS.tags })
      : tags.some((tag) => tag.length > JOURNAL_LIMITS.tagLength)
        ? t('journal:editor.tagTooLong', { max: JOURNAL_LIMITS.tagLength })
        : undefined;

  const stored = entry ?? { title: '', date, tags: [], body: '' };
  const dirty =
    title.trim() !== stored.title ||
    body !== stored.body ||
    date !== stored.date ||
    tags.join(' ').toLowerCase() !== stored.tags.join(' ');

  // Leaving the page with unsaved text asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const accept = (saved) => {
    queryClient.setQueryData(queryKeys.journal.entry(saved.id), saved);
    queryClient.invalidateQueries({ queryKey: queryKeys.journal.all });
  };
  const save = useMutation({
    mutationFn: () => {
      const input = { title: title.trim(), body, date, tags };
      return entry
        ? api.journal.update(entry.id, { ...input, baseVersion: entry.version })
        : api.journal.create({ ...input, kind });
    },
    onSuccess: (saved) => {
      toast.success(t('journal:editor.saved'));
      accept(saved);
      if (!entry) navigate(`/journal/${saved.id}`, { replace: true });
    },
    onError: (error) => {
      if (error?.code === 'VERSION_CONFLICT') {
        toast.error(t('journal:editor.conflict'));
        queryClient.invalidateQueries({ queryKey: queryKeys.journal.entry(entry.id) });
      } else toast.error(errorMessage(error));
    },
  });
  const pin = useMutation({
    mutationFn: () => api.journal.update(entry.id, { pinned: !entry.pinned }),
    onSuccess: accept,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api.journal.remove(entry.id),
    onSuccess: () => {
      toast.success(t('journal:editor.deleted'));
      queryClient.removeQueries({ queryKey: queryKeys.journal.entry(entry.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.journal.all });
      navigate('/journal', { replace: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const canSave = dirty && !tagsError && !save.isPending;
  const submit = (event) => {
    event.preventDefault();
    if (canSave) save.mutate();
  };
  const onKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (canSave) save.mutate();
    }
  };

  const heading = entry
    ? t(`journal:kindName.${entry.kind}`)
    : t(kind === 'note' ? 'journal:editor.newNote' : 'journal:editor.newJournal');

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <LinkButton to="/journal" variant="ghost" icon={ArrowLeft}>
          {t('journal:editor.back')}
        </LinkButton>
        <div className="flex flex-wrap items-center gap-2">
          {entry && (
            <>
              <Button
                icon={entry.pinned ? PinOff : Pin}
                loading={pin.isPending}
                // Pinning reloads the stored entry; unsaved text is saved first.
                disabled={dirty}
                onClick={() => pin.mutate()}
              >
                {t(entry.pinned ? 'journal:editor.unpin' : 'journal:editor.pin')}
              </Button>
              <Button icon={History} disabled={dirty} onClick={() => setDialog('revisions')}>
                {t('journal:editor.history')}
              </Button>
              <Button variant="danger-ghost" icon={Trash2} onClick={() => setDialog('delete')}>
                {t('journal:editor.delete')}
              </Button>
            </>
          )}
          <Button variant="primary" type="submit" loading={save.isPending} disabled={!canSave}>
            {t('journal:editor.save')}
          </Button>
        </div>
      </div>

      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-heading font-semibold text-ink">{heading}</h1>
          <p role="status" className="text-caption text-ink-3">
            {dirty ? t('journal:editor.unsaved') : entry ? t('journal:editor.allSaved') : ''}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
          <Field label={t('journal:editor.titleLabel')} optional>
            {(control) => (
              <Input
                {...control}
                value={title}
                maxLength={JOURNAL_LIMITS.titleLength}
                placeholder={t('journal:editor.titlePlaceholder')}
                onChange={(event) => setTitle(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('journal:editor.date')}>
            {(control) => (
              <Input
                {...control}
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value || date)}
              />
            )}
          </Field>
        </div>

        <Field
          label={t('journal:editor.tagsLabel')}
          optional
          hint={t('journal:editor.tagsHint', { max: JOURNAL_LIMITS.tags })}
          error={tagsError}
        >
          {(control) => (
            <Input
              {...control}
              value={tagsText}
              autoCapitalize="none"
              onChange={(event) => setTagsText(event.target.value)}
            />
          )}
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor="journal-body" className="text-caption font-medium text-ink">
              {t('journal:editor.bodyLabel')}
            </label>
            <SegmentedControl
              label={t('journal:editor.mode')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'write', label: t('journal:editor.write') },
                { value: 'preview', label: t('journal:editor.preview') },
              ]}
            />
          </div>
          {mode === 'write' ? (
            <Textarea
              id="journal-body"
              rows={16}
              value={body}
              maxLength={JOURNAL_LIMITS.bodyLength}
              placeholder={t('journal:editor.bodyPlaceholder')}
              onChange={(event) => setBody(event.target.value)}
              className="w-full font-mono text-body leading-relaxed"
            />
          ) : (
            <div className="min-h-64 rounded-control bg-surface-2 p-4">
              {body.trim() ? (
                <Markdown>{body}</Markdown>
              ) : (
                <p className="text-body text-ink-3">{t('journal:editor.emptyPreview')}</p>
              )}
            </div>
          )}
        </div>
      </Card>

      {dialog === 'revisions' && (
        <RevisionsDialog
          entryId={entry.id}
          onClose={() => setDialog(null)}
          onRestored={(restored) => {
            accept(restored);
            setDialog(null);
          }}
        />
      )}
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={t('journal:editor.deleteTitle')}
        description={t('journal:editor.deleteDescription')}
        confirmLabel={t('journal:editor.delete')}
      />
    </form>
  );
}

export function JournalEditorPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { entryId } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = entryId === 'new';

  const entry = useQuery({
    queryKey: queryKeys.journal.entry(entryId),
    queryFn: () => api.journal.get(entryId),
    enabled: !isNew,
  });

  if (isNew) {
    return (
      <Editor
        key="new"
        entry={null}
        kind={searchParams.get('kind') === 'note' ? 'note' : 'journal'}
      />
    );
  }
  if (entry.isPending) return <Skeleton className="h-96 rounded-card" />;
  if (entry.isError) {
    return entry.error.status === 404 ? (
      <ErrorState
        title={t('journal:editor.notFoundTitle')}
        description={
          <>
            {t('journal:editor.notFoundDescription')}{' '}
            <Link to="/journal" className="text-accent underline">
              {t('journal:editor.back')}
            </Link>
          </>
        }
      />
    ) : (
      <ErrorState description={errorMessage(entry.error)} onRetry={entry.refetch} />
    );
  }
  // A new version (saved here, restored, or changed elsewhere) starts from the stored text.
  return <Editor key={`${entry.data.id}:${entry.data.version}`} entry={entry.data} />;
}
