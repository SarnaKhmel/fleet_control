import { Header } from './components/Header';
import { MapView } from './map/MapView';
import { MapIssueBanner } from './map/MapIssueBanner';
import { FrontLineAttribution } from './frontline/FrontLineAttribution';
import { ScaleBar } from './map/ScaleBar';
import { MissionPanel } from './mission/MissionPanel';
import { ZoneReturnButton } from './mission/ZoneReturnButton';
import { ViewResetButton } from './map/ViewResetButton';
import { LocationPanel } from './location/LocationPanel';
import { WindCompass } from './wind/WindCompass';

export function App() {
  return (
    <div className="app">
      <Header />
      <main className="map-area">
        <MapView />
        <MapIssueBanner />
        <FrontLineAttribution />
        <ScaleBar />
        <MissionPanel />
        <ZoneReturnButton />
        <ViewResetButton />
        <LocationPanel />
        <WindCompass />
      </main>
    </div>
  );
}
