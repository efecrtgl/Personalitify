import { DASHBOARD_WIDGETS } from '@personalitify/shared-contracts';
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react';
import { Reorder } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '../../ui/Button.jsx';
import { Modal } from '../../ui/overlays.jsx';

/**
 * Lets the user arrange the dashboard: change the order of widgets (by dragging or with the
 * arrow buttons), hide and show them, and return to the default layout. Nothing is saved
 * until the user confirms.
 */
export function CustomizeDialog({ widgets, saving, onSave, onClose }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(widgets);

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  };
  const toggle = (id) =>
    setDraft(
      draft.map((widget) => (widget.id === id ? { ...widget, visible: !widget.visible } : widget)),
    );
  const restore = () => setDraft(DASHBOARD_WIDGETS.map((id) => ({ id, visible: true })));

  return (
    <Modal
      open
      onClose={onClose}
      title={t('dashboard:customize.title')}
      description={t('dashboard:customize.description')}
      footer={
        <>
          <Button variant="ghost" icon={RotateCcw} onClick={restore} className="mr-auto">
            {t('dashboard:customize.restore')}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common:cancel')}
          </Button>
          <Button variant="primary" onClick={() => onSave(draft)} loading={saving}>
            {t('common:save')}
          </Button>
        </>
      }
    >
      <Reorder.Group axis="y" values={draft} onReorder={setDraft} className="flex flex-col gap-1.5">
        {draft.map((widget, index) => {
          const name = t(`dashboard:widgets.${widget.id}`);
          return (
            <Reorder.Item
              key={widget.id}
              value={widget}
              className="flex items-center gap-2 rounded-control bg-surface-2 py-1.5 pr-1.5 pl-2"
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-ink-3" aria-hidden="true" />
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-1">
                <input
                  type="checkbox"
                  checked={widget.visible}
                  onChange={() => toggle(widget.id)}
                  className="size-4 accent-(--pfy-accent)"
                />
                <span className={widget.visible ? 'text-body text-ink' : 'text-body text-ink-3'}>
                  {name}
                </span>
              </label>
              <IconButton
                icon={ArrowUp}
                size="sm"
                label={t('dashboard:customize.moveUp', { name })}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              />
              <IconButton
                icon={ArrowDown}
                size="sm"
                label={t('dashboard:customize.moveDown', { name })}
                disabled={index === draft.length - 1}
                onClick={() => move(index, 1)}
              />
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
    </Modal>
  );
}
