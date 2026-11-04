import { Header } from './components/Header';
import { MapView } from './map/MapView';
import { LocationPanel } from './location/LocationPanel';
import { WindCompass } from './wind/WindCompass';
import './wind/windSync';

export function App() {
  return (
    <div className="app">
      <Header />
      <main className="map-area">
        <MapView />
        <LocationPanel />
        <WindCompass />
      </main>
    </div>
  );
}
