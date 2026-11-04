// Stand-in for maplibre-gl in jsdom (no WebGL). Records calls so tests can assert on them.
export type ClickEvent = { lngLat: { lat: number; lng: number } };
type Handler = (event: ClickEvent) => void;

export const mapInstances: FakeMap[] = [];

export class FakeMap {
  style: string;
  handlers: Record<string, Handler[]> = {};
  lastFlyTo: { center: [number, number]; zoom: number } | null = null;
  layers: Record<string, { id: string; visibility?: string; color?: string }> = {};
  pitch = 0;
  sources: Record<string, object> = {};
  terrain: object | null = null;

  constructor(options: { style: string }) {
    this.style = options.style;
    mapInstances.push(this);
  }
  on(event: string, handler: Handler) {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }
  emit(event: string, payload: ClickEvent) {
    this.handlers[event]?.forEach((handler) => handler(payload));
  }
  setStyle(style: string) {
    this.style = style;
  }
  getSource(id: string) {
    return this.sources[id];
  }
  isStyleLoaded() {
    return true;
  }
  getCenter() {
    return { lat: 50, lng: 30 };
  }
  addSource(id: string, spec: object) {
    this.sources[id] = spec;
  }
  setTerrain(terrain: object | null) {
    this.terrain = terrain;
  }
  queryTerrainElevation(_lngLat: [number, number]) {
    return 180;
  }
  once(event: string, handler: Handler) {
    return this.on(event, handler);
  }
  removeSource(id: string) {
    delete this.sources[id];
  }
  removeLayer(id: string) {
    delete this.layers[id];
  }
  getLayer(id: string) {
    return this.layers[id];
  }
  addLayer(spec: { id: string }) {
    this.layers[spec.id] = { id: spec.id };
  }
  setLayoutProperty(id: string, name: string, value: string) {
    if (name === 'visibility') this.layers[id].visibility = value;
  }
  setPaintProperty(id: string, name: string, value: string) {
    if (name === 'fill-extrusion-color') this.layers[id].color = value;
  }
  setPitch(pitch: number) {
    this.pitch = pitch;
  }
  flyTo(options: { center: [number, number]; zoom: number }) {
    this.lastFlyTo = options;
  }
  getZoom() {
    return 10;
  }
  remove() {}
}

export class Marker {
  lngLat: [number, number] | null = null;
  setLngLat(lngLat: [number, number]) {
    this.lngLat = lngLat;
    return this;
  }
  addTo() {
    return this;
  }
  remove() {}
}

export { FakeMap as Map };

export function setWorkerUrl(_url: string) {}
