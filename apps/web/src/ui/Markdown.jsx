import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/cn.js';

/**
 * How each Markdown element looks. Raw HTML in the text is never rendered: the renderer
 * shows it as text, so what a user writes cannot inject markup or scripts.
 */
const components = {
  h1: (props) => (
    <h3 className="mt-5 mb-2 text-title font-semibold text-ink first:mt-0" {...props} />
  ),
  h2: (props) => (
    <h4 className="mt-5 mb-2 text-heading font-semibold text-ink first:mt-0" {...props} />
  ),
  h3: (props) => (
    <h5 className="mt-4 mb-1.5 text-body font-semibold text-ink first:mt-0" {...props} />
  ),
  h4: (props) => (
    <h6 className="mt-4 mb-1.5 text-body font-semibold text-ink first:mt-0" {...props} />
  ),
  p: (props) => <p className="my-3 first:mt-0 last:mb-0" {...props} />,
  ul: (props) => <ul className="my-3 list-disc pl-6 marker:text-ink-3" {...props} />,
  ol: (props) => <ol className="my-3 list-decimal pl-6 marker:text-ink-3" {...props} />,
  li: (props) => <li className="my-1" {...props} />,
  blockquote: (props) => (
    <blockquote className="my-3 border-l-2 border-line-strong pl-4 text-ink-2" {...props} />
  ),
  a: ({ href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline underline-offset-2"
      {...props}
    />
  ),
  code: (props) => (
    <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]" {...props} />
  ),
  pre: (props) => (
    <pre
      className="my-3 overflow-x-auto rounded-control bg-surface-2 p-3 font-mono text-caption [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  hr: () => <hr className="my-5 border-line" />,
  // Pictures would be fetched from wherever the text points; a journal stays offline.
  img: ({ alt }) => <span className="text-ink-3">{alt}</span>,
};

/** Renders the user's Markdown as formatted, safe text. */
export function Markdown({ children, className }) {
  return (
    <div className={cn('min-w-0 text-body leading-relaxed break-words text-ink', className)}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
