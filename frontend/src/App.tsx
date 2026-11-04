import { Header } from './components/Header';
import { MapView } from './map/MapView';
import { LocationPanel } from './location/LocationPanel';

export function App() {
  return (
    <div className="app">
      <Header />
      <main className="map-area">
        <MapView />
        <LocationPanel />
      </main>
    </div>
  );
}
