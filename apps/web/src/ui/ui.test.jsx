import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '../lib/i18n.js';
import { Button, IconButton } from './Button.jsx';
import { Avatar } from './display.jsx';
import { Field, Input, SegmentedControl, Switch } from './fields.jsx';
import { ConfirmDialog, Menu, Modal } from './overlays.jsx';
import { ToastProvider, useToast } from './toast.jsx';

describe('Button', () => {
  it('is busy and not clickable while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Kaydet
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Kaydet' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not submit a form unless asked to', () => {
    render(<Button>Plain</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('gives icon-only buttons an accessible name', () => {
    render(<IconButton icon={Pencil} label="Düzenle" />);
    expect(screen.getByRole('button', { name: 'Düzenle' })).toBeInTheDocument();
  });
});

describe('Field', () => {
  it('connects label, hint and error to the control', () => {
    const { rerender } = render(
      <Field label="E-posta" hint="İş adresiniz">
        {(props) => <Input {...props} />}
      </Field>,
    );
    const input = screen.getByLabelText('E-posta');
    expect(input).toHaveAccessibleDescription('İş adresiniz');
    expect(input).not.toHaveAttribute('aria-invalid');

    rerender(
      <Field label="E-posta" hint="İş adresiniz" error="Geçersiz adres">
        {(props) => <Input {...props} />}
      </Field>,
    );
    expect(screen.getByLabelText('E-posta')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('E-posta')).toHaveAccessibleDescription('Geçersiz adres');
    expect(screen.getByRole('alert')).toHaveTextContent('Geçersiz adres');
  });
});

describe('Switch', () => {
  it('exposes switch semantics and toggles with the keyboard', async () => {
    const user = userEvent.setup();
    function Example() {
      const [on, setOn] = useState(false);
      return (
        <Switch label="Bildirimler" description="Hatırlatıcılar" checked={on} onChange={setOn} />
      );
    }
    render(<Example />);
    const control = screen.getByRole('switch', { name: 'Bildirimler' });
    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(control).toHaveAccessibleDescription('Hatırlatıcılar');

    control.focus();
    await user.keyboard(' ');
    expect(control).toHaveAttribute('aria-checked', 'true');
  });
});

describe('SegmentedControl', () => {
  it('behaves as a radio group', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Tema"
        value="light"
        onChange={onChange}
        options={[
          { value: 'light', label: 'Açık' },
          { value: 'dark', label: 'Koyu' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Açık' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Koyu' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});

describe('Modal', () => {
  it('is labelled by its title and closes from the close button', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Cihazı yeniden adlandır" description="Yeni bir ad girin">
        <p>İçerik</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Cihazı yeniden adlandır' });
    expect(dialog).toHaveAccessibleDescription('Yeni bir ad girin');
    await userEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing inside while closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Gizli">
        <p>İçerik</p>
      </Modal>,
    );
    expect(screen.queryByText('İçerik')).not.toBeInTheDocument();
  });

  it('asks for confirmation with separate cancel and confirm actions', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Silinsin mi?"
        confirmLabel="Sil"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sil' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Menu', () => {
  function Example({ onSelect }) {
    return (
      <Menu
        label="İşlemler"
        trigger={<button type="button">Aç</button>}
        items={[
          { id: 'edit', label: 'Düzenle', onSelect: () => onSelect('edit') },
          { id: 'copy', label: 'Kopyala', onSelect: () => onSelect('copy') },
          { separator: true },
          { id: 'delete', label: 'Sil', tone: 'danger', onSelect: () => onSelect('delete') },
        ]}
      />
    );
  }

  it('opens, moves with the arrow keys and activates with Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Example onSelect={onSelect} />);
    const trigger = screen.getByRole('button', { name: 'Aç' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Düzenle' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Kopyala' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Sil' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('delete');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape and on an outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Example onSelect={() => {}} />
        <p>dışarısı</p>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Aç' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Aç' }));
    await user.click(screen.getByText('dışarısı'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Toast', () => {
  it('announces confirmations politely and errors assertively', async () => {
    function Example() {
      const toast = useToast();
      return (
        <>
          <button type="button" onClick={() => toast.success('Kaydedildi')}>
            ok
          </button>
          <button type="button" onClick={() => toast.error('Başarısız')}>
            fail
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Example />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'ok' }));
    expect(screen.getByRole('status')).toHaveTextContent('Kaydedildi');
    await userEvent.click(screen.getByRole('button', { name: 'fail' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Başarısız');

    await userEvent.click(screen.getAllByRole('button', { name: 'Kapat' })[0]);
    // The toast leaves with a short exit animation.
    await waitFor(() => expect(screen.queryByText('Kaydedildi')).not.toBeInTheDocument());
  });
});

describe('Avatar', () => {
  it('shows initials with readable contrast', () => {
    const { container, rerender } = render(<Avatar name="ada lovelace" color="#ffd60a" />);
    expect(container).toHaveTextContent('AL');
    expect(container.firstChild.style.color).toBe('rgb(29, 29, 31)');
    rerender(<Avatar name="İpek" color="#5e5ce6" />);
    expect(container).toHaveTextContent('İ');
    expect(container.firstChild.style.color).toBe('rgb(255, 255, 255)');
  });
});
