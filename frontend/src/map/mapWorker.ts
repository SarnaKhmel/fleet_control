import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// MapLibre runs its tile parser in a Web Worker. Bundlers (Vite dev pre-bundling)
// move that file, so point MapLibre at the real asset URL explicitly.
setWorkerUrl(workerUrl);
