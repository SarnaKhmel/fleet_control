// Map pointer for the selected location, in the style of common web maps: a teardrop with a dot.
// Its tip sits on the coordinate (the marker is anchored at the bottom).
export function locationPinElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'location-pin';
  el.setAttribute('aria-label', 'Selected location');
  el.innerHTML =
    '<svg viewBox="0 0 24 34" width="24" height="34" aria-hidden="true">' +
    '<path d="M12 0C5.4 0 0 5.4 0 12c0 8.6 10.6 20.2 11.1 20.7a1.2 1.2 0 0 0 1.8 0C13.4 32.2 24 20.6 24 12 24 5.4 18.6 0 12 0z" fill="currentColor" stroke="#0b1220" stroke-width="1"/>' +
    '<circle cx="12" cy="12" r="4.5" fill="#ffffff"/>' +
    '</svg>';
  return el;
}
