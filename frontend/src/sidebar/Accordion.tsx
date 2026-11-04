import { useState, type ReactNode } from 'react';

interface AccordionProps {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

// A collapsible section. The body stays mounted when closed, so its state survives toggling.
export function Accordion({ title, summary, defaultOpen = false, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`accordion${open ? ' is-open' : ''}`}>
      <button type="button" className="accordion-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="accordion-title">{title}</span>
        {summary && <span className="accordion-summary">{summary}</span>}
        <svg className="accordion-chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="accordion-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
