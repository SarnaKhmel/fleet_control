// Stand-in for maplibre-gl in jsdom (no WebGL). Records calls so tests can assert on them.
export type ClickEvent = { lngLat: { lat: number; lng: number } };
type Handler = (event: ClickEvent) => void;

export const mapInstances: FakeMap[] = [];

export class FakeMap {
  style: string;
  handlers: Record<string, Handler[]> = {};

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
