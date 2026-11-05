import { useTranslation } from 'react-i18next';
import { useFrontLineStore } from './frontLine';

// Credit and disclaimer for the approximate front line: source reference with a link, and a note
// that the zones are hand-traced, not survey data.
export function FrontLineAttribution() {
  const { t } = useTranslation();
  const enabled = useFrontLineStore((state) => state.enabled);
  if (!enabled) return null;
  return (
    <div className="front-line-attribution">
      <a href="https://deepstatemap.live" target="_blank" rel="noreferrer">
        {t('frontLine.source')}
      </a>
      <div className="muted">{t('frontLine.approximate')}</div>
    </div>
  );
}
