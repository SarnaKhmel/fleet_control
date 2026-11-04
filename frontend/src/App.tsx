import { Header } from './components/Header';
import { MapView } from './map/MapView';
import { LocationPanel } from './location/LocationPanel';
import { WindIndicator } from './wind/WindIndicator';

export function App() {
  return (
    <div className="app">
      <Header />
      <main className="map-area">
        <MapView />
        <LocationPanel />
        <WindIndicator />
      </main>
    </div>
  );
}
