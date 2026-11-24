import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.jsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App connectivity shell', () => {
  it('shows the API version when the server answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { status: 'ok', version: '9.9.9' } }),
      }),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveAttribute('data-status', 'online'),
    );
    expect(screen.getByText(/9\.9\.9/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/v1/health');
  });

  it('offers a retry when the server cannot be reached', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValue({ ok: true, json: async () => ({ data: { version: '1.0.0' } }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    const retry = await screen.findByRole('button');
    await userEvent.click(retry);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveAttribute('data-status', 'online'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
