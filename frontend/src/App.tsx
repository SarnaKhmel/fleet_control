import { Header } from './components/Header';
import { MapView } from './map/MapView';
import { MapIssueBanner } from './map/MapIssueBanner';
import { LocationPanel } from './location/LocationPanel';
import { WindCompass } from './wind/WindCompass';

export function App() {
  return (
    <div className="app">
      <Header />
      <main className="map-area">
        <MapView />
        <MapIssueBanner />
        <LocationPanel />
        <WindCompass />
      </main>
    </div>
  );
}
