import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resetEverything } from '../mission/resetAll';

// Header button that clears the whole mission setup. A second press within four seconds confirms it.
export function ResetAllButton() {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={armed ? 'btn-danger' : undefined}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        resetEverything();
      }}
    >
      {armed ? t('header.resetAllConfirm') : t('header.resetAll')}
    </button>
  );
}
