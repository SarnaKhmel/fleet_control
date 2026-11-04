import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function BurgerMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="burger">
      <button
        type="button"
        className="burger-button"
        aria-label={t('menu.open')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>
      {open && (
        <nav className="burger-menu">
          <a href="/legend.html" onClick={() => setOpen(false)}>
            {t('menu.legend')}
          </a>
        </nav>
      )}
    </div>
  );
}
