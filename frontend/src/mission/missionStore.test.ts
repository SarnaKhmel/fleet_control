import { beforeEach, describe, expect, it } from 'vitest';
import { layoutFrom, startProblem, useMissionStore } from './missionStore';

const p = (lat: number, lng: number) => ({ lat, lng });
const store = () => useMissionStore.getState();

describe('mission store', () => {
  beforeEach(() => {
    useMissionStore.setState({ center: null, widthKm: 200, heightKm: 200, layoutKind: 'single', points: [], phase: 'idle', drones: {}, error: null });
  });

  it('single layout keeps one point and replaces it on click', () => {
    store().addPoint(p(50.4, 30.5));
    store().addPoint(p(50.5, 30.6));
    expect(store().points).toEqual([p(50.5, 30.6)]);
  });

  it('separate layout collects three points', () => {
    store().setLayoutKind('separate');
    [p(50, 30), p(50.1, 30), p(50.2, 30), p(50.3, 30)].forEach(store().addPoint);
    expect(store().points).toHaveLength(3);
    expect(layoutFrom(store())).toEqual({ kind: 'separate', points: store().points });
  });

  it('reports an incomplete or outside start', () => {
    expect(startProblem(store())).toBe('incomplete');
    store().addPoint(p(52, 30)); // ~222 km north of the default center
    expect(startProblem(store())).toBe('outside');
    store().addPoint(p(50.45, 30.52));
    expect(startProblem(store())).toBeNull();
  });

  it('applies boot messages to the roster without a position', () => {
    store().apply({ type: 'drone_boot', droneId: 'drone-1', status: 'booting', progress: 40 });
    expect(store().drones['drone-1']).toEqual({ callsign: 'drone-1', status: 'booting', progress: 40, position: null, heading: null });
  });

  it('takes the position and heading from the first telemetry', () => {
    const telemetry = {
      meta: { timestamp: 't', drone_id: 'drone-2', callsign: 'BA-02' },
      position_and_kinematics: { gps: { latitude: 50.4, longitude: 30.5, altitude_amsl_m: 150 }, heading_deg: 90 },
    } as never;
    store().apply({ type: 'drone_online', telemetry });
    expect(store().drones['drone-2']).toMatchObject({ callsign: 'BA-02', status: 'idle', position: { lat: 50.4, lng: 30.5 }, heading: 90 });
  });

  it('mission_error returns the phase to idle, mission_reset clears the roster', () => {
    store().markStarting();
    store().apply({ type: 'mission_error', reason: 'already_running' });
    expect(store().phase).toBe('idle');
    store().markStarting();
    store().apply({ type: 'drone_boot', droneId: 'drone-1', status: 'booting', progress: 10 });
    store().apply({ type: 'mission_reset' });
    expect(store().drones).toEqual({});
  });

  it('draws a zone from two clicks and sets its center and size', () => {
    store().setDrawing(true);
    store().drawClick({ lat: 50, lng: 30 });
    expect(store().drawAnchor).toEqual({ lat: 50, lng: 30 });
    store().drawClick({ lat: 50.1, lng: 30.2 });
    expect(store().drawing).toBe(false);
    expect(store().drawAnchor).toBeNull();
    expect(store().widthKm).toBeGreaterThan(1);
    expect(store().heightKm).toBeGreaterThan(1);
  });
});
