import { Header } from './components/Header';
import { MapView } from './map/MapView';
import { MapIssueBanner } from './map/MapIssueBanner';
import { FrontLineAttribution } from './frontline/FrontLineAttribution';
import { ScaleBar } from './map/ScaleBar';
import { ZoneReturnButton } from './mission/ZoneReturnButton';
import { Sidebar } from './sidebar/Sidebar';
import { SettingsPanel } from './components/SettingsPanel';

export function App() {
  return (
    <div className="app">
      <Header />
      <div className="workspace">
        <Sidebar />
        <SettingsPanel />
      <main className="map-area">
        <MapView />
        <MapIssueBanner />
        <FrontLineAttribution />
        <ScaleBar />
        <ZoneReturnButton />
      </main>
      </div>
    </div>
  );
}
