import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Pages of the app outside the map. Add new pages here.
const PAGES = [{ key: 'legend', href: '/legend.html' }] as const;

// Opens a full-height drawer on the left, styled like the side panel. Closes on Escape or outside click.
export function BurgerMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="burger-button"
        aria-label={t('menu.open')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span />
        <span />
        <span />
      </button>
      {open && (
        <>
          <div className="nav-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="nav-drawer" aria-label={t('menu.title')}>
            <div className="nav-drawer-head">
              <h2>{t('menu.title')}</h2>
              <button type="button" className="sidebar-toggle" aria-label={t('menu.close')} onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <nav>
              <ul className="nav-list">
                {PAGES.map((page) => (
                  <li key={page.key}>
                    <a href={page.href}>{t(`menu.${page.key}`)}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </>
      )}
    </>
  );
}
