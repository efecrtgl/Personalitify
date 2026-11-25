import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown.jsx';

/** What a user writes in the journal is shown as formatted text and can do nothing else. */
describe('Markdown', () => {
  it('formats text', () => {
    render(<Markdown>{'# Başlık\n\n**kalın** ve _eğik_\n\n- bir\n- iki\n\n> alıntı'}</Markdown>);
    expect(screen.getByRole('heading', { name: 'Başlık' })).toBeInTheDocument();
    expect(screen.getByText('kalın').tagName).toBe('STRONG');
    expect(screen.getByText('eğik').tagName).toBe('EM');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('alıntı').closest('blockquote')).not.toBeNull();
  });

  it('never turns typed HTML into elements', () => {
    const { container } = render(
      <Markdown>
        {
          '<script>window.hacked = true</script>\n\n<img src=x onerror="window.hacked = true">\n\n<iframe src="https://example.test"></iframe>\n\n<a href="https://example.test" onclick="steal()">tıkla</a>'
        }
      </Markdown>,
    );
    expect(container.querySelector('script, img, iframe')).toBeNull();
    expect(container.querySelector('[onclick], [onerror]')).toBeNull();
    expect(window.hacked).toBeUndefined();
  });

  it('drops links that would run code and opens real ones safely', () => {
    const { container } = render(
      <Markdown>
        {
          '[kötü](javascript:alert(1)) [veri](data:text/html,<script>alert(1)</script>) [iyi](https://example.test/sayfa)'
        }
      </Markdown>,
    );
    const hrefs = [...container.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs.some((href) => /^(javascript|data|vbscript):/i.test(href ?? ''))).toBe(false);
    const good = screen.getByRole('link', { name: 'iyi' });
    expect(good).toHaveAttribute('href', 'https://example.test/sayfa');
    expect(good).toHaveAttribute('target', '_blank');
    expect(good).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('shows the description of an image instead of loading it', () => {
    const { container } = render(
      <Markdown>{'![bir manzara](https://tracker.example.test/pixel.png)'}</Markdown>,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('bir manzara')).toBeInTheDocument();
  });
});
