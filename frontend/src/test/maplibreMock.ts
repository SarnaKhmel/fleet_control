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
  bounds = { west: 29, east: 31, south: 49, north: 51 };
  getBounds() {
    const b = this.bounds;
    return { getWest: () => b.west, getEast: () => b.east, getSouth: () => b.south, getNorth: () => b.north };
  }
  fitBounds(_bounds: unknown, _options?: unknown) {
    this.fitted = true;
  }
  fitted = false;
  boxZoom = { disable() {}, enable() {} };
  dragPan = { disable() {}, enable() {} };
  project(lngLat: [number, number]) {
    return { x: lngLat[0], y: lngLat[1] };
  }
  addSource(id: string, spec: object) {
    // Like a GeoJSON source: its data can be replaced later.
    const source: Record<string, unknown> = { ...spec };
    source.setData = (data: unknown) => {
      source.data = data;
    };
    this.sources[id] = source;
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
  bearing = 0;
  getBearing() {
    return this.bearing;
  }
  lastEaseTo: Record<string, unknown> | null = null;
  easeTo(options: Record<string, unknown>) {
    this.lastEaseTo = options;
  }
  remove() {}
}

export const markerInstances: Marker[] = [];

export class Marker {
  lngLat: [number, number] | null = null;
  added = false;
  element: HTMLElement | undefined;
  draggable: boolean;
  handlers: Record<string, (() => void)[]> = {};
  constructor(options?: { element?: HTMLElement; draggable?: boolean }) {
    this.element = options?.element;
    this.draggable = !!options?.draggable;
    markerInstances.push(this);
  }
  on(event: string, handler: () => void) {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }
  fire(event: string) {
    this.handlers[event]?.forEach((handler) => handler());
  }
  getLngLat() {
    return { lng: this.lngLat![0], lat: this.lngLat![1] };
  }
  setLngLat(lngLat: [number, number]) {
    this.lngLat = lngLat;
    return this;
  }
  addTo() {
    this.added = true;
    return this;
  }
  remove() {
    this.added = false;
  }
}

export { FakeMap as Map };

export function setWorkerUrl(_url: string) {}
