import { useTranslation } from 'react-i18next';
import { useMapIssueStore } from './mapIssue';

export function MapIssueBanner() {
  const { t } = useTranslation();
  const issue = useMapIssueStore((state) => state.issue);
  if (!issue) return null;
  return (
    <div className="map-issue" role="alert">
      {t(`map.issue.${issue}`)}
    </div>
  );
}
