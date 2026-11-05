import { Header } from './components/Header';
import { MapView } from './map/MapView';
import { MapIssueBanner } from './map/MapIssueBanner';
import { FrontLineAttribution } from './frontline/FrontLineAttribution';
import { ScaleBar } from './map/ScaleBar';
import { MapCompass } from './map/MapCompass';
import { ZoneReturnButton } from './mission/ZoneReturnButton';
import { Sidebar } from './sidebar/Sidebar';
import { RightPanel } from './components/RightPanel';

export function App() {
  return (
    <div className="app">
      <Header />
      <div className="workspace">
        <Sidebar />
        <RightPanel />
      <main className="map-area">
        <MapView />
        <MapIssueBanner />
        <FrontLineAttribution />
        <div className="map-scale-group">
          <MapCompass />
          <ScaleBar />
        </div>
        <ZoneReturnButton />
      </main>
      </div>
    </div>
  );
}
