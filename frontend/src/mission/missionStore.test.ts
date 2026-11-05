import { beforeEach, describe, expect, it } from 'vitest';
import { layoutFrom, startProblem, useMissionStore } from './missionStore';

const p = (lat: number, lng: number) => ({ lat, lng });
const store = () => useMissionStore.getState();

describe('mission store', () => {
  beforeEach(() => {
    useMissionStore.setState({ center: null, widthKm: 200, heightKm: 200, layoutKind: 'single', points: [], phase: 'idle', drones: {}, error: null, picking: false, drawing: false, drawAnchor: null, drawCursor: null, droneCount: 3 });
  });

  it('single layout keeps one point and replaces it on click', () => {
    store().addPoint(p(50.4, 30.5));
    store().addPoint(p(50.5, 30.6));
    expect(store().points).toEqual([p(50.5, 30.6)]);
  });

  it('keeps the drone count a whole number from 1 to MAX_DRONES, fixed while the mission runs', () => {
    store().setDroneCount(7.4);
    expect(store().droneCount).toBe(7);
    store().setDroneCount(0);
    expect(store().droneCount).toBe(1);
    store().setDroneCount(99);
    expect(store().droneCount).toBe(20);
    store().setDroneCount(Number.NaN);
    expect(store().droneCount).toBe(20);
    store().markStarting();
    store().setDroneCount(4);
    expect(store().droneCount).toBe(20);
  });

  it('separate layout needs one start point per drone', () => {
    store().setDroneCount(5);
    store().setLayoutKind('separate');
    [p(50, 30), p(50.1, 30), p(50.2, 30), p(50.3, 30)].forEach(store().addPoint);
    expect(layoutFrom(store())).toBeNull();
    store().addPoint(p(50.4, 30));
    expect(layoutFrom(store())).toEqual({ kind: 'separate', points: store().points });
    store().setDroneCount(2); // fewer drones: the extra points go
    expect(store().points).toEqual([p(50, 30), p(50.1, 30)]);
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
    expect(store().drones['drone-1']).toEqual({ callsign: 'drone-1', status: 'booting', cause: null, warning: null, progress: 40, position: null, heading: null, altitudeM: null, groundM: null, speedMs: 0, batteryPct: 100, crabDeg: 0, altitudeAglM: 60, cruiseSpeedMs: 10, trail: [], tasks: [] });
  });

  it('takes the position and heading from the first telemetry', () => {
    const telemetry = {
      meta: { timestamp: 't', drone_id: 'drone-2', callsign: 'BA-02' },
      position_and_kinematics: { gps: { latitude: 50.4, longitude: 30.5, altitude_amsl_m: 150 }, heading_deg: 90 },
      power_system: { battery_remaining_pct: 100 },
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

  it('turns the setup modes off when the mission starts, so they do not swallow map clicks', () => {
    store().setPicking(true);
    store().setDrawing(true);
    store().drawClick({ lat: 50, lng: 30 });
    store().markStarting();
    expect(store()).toMatchObject({ picking: false, drawing: false, drawAnchor: null, drawCursor: null });
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

  it('moves a known drone on position messages and keeps its tasks', () => {
    store().apply({ type: 'drone_online', telemetry: { meta: { drone_id: 'drone-1', callsign: 'BA-01' }, position_and_kinematics: { gps: { latitude: 50, longitude: 30 }, heading_deg: 0 }, power_system: { battery_remaining_pct: 100 } } } as never);
    store().apply({ type: 'drone_tasks', droneId: 'drone-1', trail: [{ lat: 50, lng: 30 }], tasks: [{ lat: 50.2, lng: 30.2 }] });
    store().apply({ type: 'position', droneId: 'drone-1', position: { lat: 50.1, lng: 30.1 }, heading: 90, speedMs: 10, altitudeM: 210, groundM: 150, batteryPct: 97, crabDeg: -4 });
    expect(store().drones['drone-1']).toMatchObject({ position: { lat: 50.1, lng: 30.1 }, heading: 90, trail: [{ lat: 50, lng: 30 }], tasks: [{ lat: 50.2, lng: 30.2 }] });
  });

  it('takes the task list and flown path of a drone from drone_tasks', () => {
    store().apply({ type: 'drone_online', telemetry: { meta: { drone_id: 'drone-1', callsign: 'BA-01' }, position_and_kinematics: { gps: { latitude: 50, longitude: 30 }, heading_deg: 0 }, power_system: { battery_remaining_pct: 100 } } } as never);
    expect(store().drones['drone-1']).toMatchObject({ trail: [], tasks: [] });
    store().apply({ type: 'drone_tasks', droneId: 'drone-1', trail: [{ lat: 50, lng: 30 }], tasks: [{ lat: 50.2, lng: 30.2 }, { lat: 50.3, lng: 30.3 }] });
    expect(store().drones['drone-1']).toMatchObject({ trail: [{ lat: 50, lng: 30 }], tasks: [{ lat: 50.2, lng: 30.2 }, { lat: 50.3, lng: 30.3 }] });
    store().apply({ type: 'drone_tasks', droneId: 'drone-9', trail: [], tasks: [{ lat: 50, lng: 30 }] });
    expect(store().drones['drone-9']).toBeUndefined();
  });

  it('takes the drone status from drone_status and keeps where it fell and its tasks', () => {
    store().apply({ type: 'drone_online', telemetry: { meta: { drone_id: 'drone-1', callsign: 'BA-01' }, position_and_kinematics: { gps: { latitude: 50, longitude: 30 }, heading_deg: 0 }, power_system: { battery_remaining_pct: 100 } } } as never);
    store().apply({ type: 'drone_tasks', droneId: 'drone-1', trail: [{ lat: 50, lng: 30 }, { lat: 50.1, lng: 30.1 }], tasks: [{ lat: 50.2, lng: 30.2 }] });
    store().apply({ type: 'position', droneId: 'drone-1', position: { lat: 50.1, lng: 30.1 }, heading: 90, speedMs: 0, altitudeM: 150, groundM: 150, batteryPct: 0, crabDeg: 0 });
    store().apply({ type: 'drone_status', droneId: 'drone-1', status: 'moving' });
    expect(store().drones['drone-1'].status).toBe('moving');
    store().apply({ type: 'drone_status', droneId: 'drone-1', status: 'destroyed' });
    expect(store().drones['drone-1']).toMatchObject({ status: 'destroyed', position: { lat: 50.1, lng: 30.1 }, batteryPct: 0, tasks: [{ lat: 50.2, lng: 30.2 }] });
    store().apply({ type: 'drone_status', droneId: 'drone-9', status: 'idle' });
    expect(store().drones['drone-9']).toBeUndefined();
  });

  it('takes the ground under the drone from positions and its height and speed settings from drone_settings', () => {
    store().apply({ type: 'drone_online', telemetry: { meta: { drone_id: 'drone-1', callsign: 'BA-01' }, position_and_kinematics: { gps: { latitude: 50, longitude: 30, altitude_amsl_m: 300 }, relative_altitude_m: 0, heading_deg: 0 }, power_system: { battery_remaining_pct: 100 } } } as never);
    expect(store().drones['drone-1']).toMatchObject({ altitudeM: 300, groundM: 300, altitudeAglM: 60, cruiseSpeedMs: 10 });
    store().apply({ type: 'position', droneId: 'drone-1', position: { lat: 50.1, lng: 30 }, heading: 0, speedMs: 10, altitudeM: 420, groundM: 330, batteryPct: 99, crabDeg: 0 });
    expect(store().drones['drone-1']).toMatchObject({ altitudeM: 420, groundM: 330 });
    store().apply({ type: 'drone_settings', droneId: 'drone-1', altitudeAglM: 150, cruiseSpeedMs: 20 });
    expect(store().drones['drone-1']).toMatchObject({ altitudeAglM: 150, cruiseSpeedMs: 20, groundM: 330 });
    store().apply({ type: 'drone_settings', droneId: 'drone-9', altitudeAglM: 150, cruiseSpeedMs: 20 });
    expect(store().drones['drone-9']).toBeUndefined();
  });

  it('takes collision warnings and the cause of a fall', () => {
    store().apply({ type: 'drone_online', telemetry: { meta: { drone_id: 'drone-1', callsign: 'BA-01' }, position_and_kinematics: { gps: { latitude: 50, longitude: 30 }, heading_deg: 0 }, power_system: { battery_remaining_pct: 100 } } } as never);
    store().apply({ type: 'drone_warning', droneId: 'drone-1', warning: { kind: 'building' as const, point: { lat: 50.02, lng: 30 }, distanceM: 1200, etaS: 12, heightM: 70 } });
    expect(store().drones['drone-1'].warning).toMatchObject({ etaS: 12, heightM: 70 });
    store().apply({ type: 'drone_warning', droneId: 'drone-1', warning: null });
    expect(store().drones['drone-1'].warning).toBeNull();
    store().apply({ type: 'drone_status', droneId: 'drone-1', status: 'destroyed', cause: 'collision' });
    expect(store().drones['drone-1']).toMatchObject({ status: 'destroyed', cause: 'collision' });
  });

  it('collects the seen ground, takes it whole from a snapshot and forgets it on reset or a new start', () => {
    const grid = { origin: { lat: 50, lng: 30 }, cellM: 100 };
    store().apply({ type: 'recon_cells', grid, cells: [[0, 1], [0, 2]] });
    store().apply({ type: 'recon_cells', grid, cells: [[1, 2]] });
    expect(store()).toMatchObject({ reconGrid: grid, reconCells: [[0, 1], [0, 2], [1, 2]] });
    store().apply({ type: 'mission_snapshot', running: true, droneCount: 3, drones: [], recon: { grid, cells: [[7, 7]] } });
    expect(store().reconCells).toEqual([[7, 7]]);
    store().apply({ type: 'mission_reset' });
    expect(store()).toMatchObject({ reconGrid: null, reconCells: [] });
    store().apply({ type: 'recon_cells', grid, cells: [[0, 1]] });
    store().markStarting();
    expect(store()).toMatchObject({ reconGrid: null, reconCells: [] });
  });

  it('keeps the known units by id: a newer report replaces one, a snapshot replaces all, a reset or new start clears them', () => {
    const enemy = { id: 'enemy-1', side: 'enemy' as const, kind: 'vehicle' as const, position: { lat: 50.1, lng: 30 }, headingDeg: 90, speedMs: 6, source: 'drone' as const, detectedByDroneId: 'drone-1', inSight: true };
    const ally = { ...enemy, id: 'ally-1', side: 'ally' as const, kind: 'infantry' as const, headingDeg: null, speedMs: 0, source: 'intel' as const, detectedByDroneId: null, inSight: true };
    store().apply({ type: 'units', units: [enemy, ally] });
    store().apply({ type: 'units', units: [{ ...enemy, position: { lat: 50.2, lng: 30 } }] });
    expect(Object.keys(store().units)).toEqual(['enemy-1', 'ally-1']);
    expect(store().units['enemy-1'].position).toEqual({ lat: 50.2, lng: 30 });
    store().apply({ type: 'mission_snapshot', running: true, droneCount: 3, drones: [], units: [ally] });
    expect(Object.keys(store().units)).toEqual(['ally-1']);
    store().apply({ type: 'mission_reset' });
    expect(store().units).toEqual({});
    store().apply({ type: 'units', units: [enemy] });
    store().markStarting();
    expect(store().units).toEqual({});
  });


  it('removes a unit a strike destroyed, and marks one it damaged', () => {
    const enemy = { id: 'enemy-1', side: 'enemy' as const, kind: 'vehicle' as const, position: { lat: 50.1, lng: 30 }, headingDeg: null, speedMs: 0, source: 'drone' as const, detectedByDroneId: 'drone-1', inSight: true };
    const other = { ...enemy, id: 'enemy-2' };
    store().apply({ type: 'units', units: [enemy, other] });
    store().apply({ type: 'unit_hit', unitId: 'enemy-1', droneId: 'drone-1', outcome: 'destroyed' });
    store().apply({ type: 'unit_hit', unitId: 'enemy-2', droneId: 'drone-1', outcome: 'damaged' });
    expect(Object.keys(store().units)).toEqual(['enemy-2']);
    expect(store().units['enemy-2'].damaged).toBe(true);
  });
  it('treats missing or malformed task lists from the server as empty', () => {
    store().apply({ type: 'drone_online', telemetry: { meta: { drone_id: 'drone-1', callsign: 'BA-01' }, position_and_kinematics: { gps: { latitude: 50, longitude: 30 }, heading_deg: 0 }, power_system: { battery_remaining_pct: 100 } } } as never);
    store().apply({ type: 'drone_tasks', droneId: 'drone-1', trail: 'x', tasks: [{ lat: 'a' }] } as never);
    expect(store().drones['drone-1']).toMatchObject({ trail: [], tasks: [] });
    store().apply({ type: 'mission_snapshot', running: true, drones: [{ droneId: 'drone-2', callsign: 'BA-02', status: 'idle', progress: 100, position: null, heading: null, altitudeM: null, groundM: null, speedMs: 0, batteryPct: 100, crabDeg: 0 }] } as never);
    expect(store().drones['drone-2']).toMatchObject({ trail: [], tasks: [] });
  });

  it('fixes the zone, layout and start points once the mission runs', () => {
    store().addPoint({ lat: 50.45, lng: 30.52 });
    store().markStarting();
    store().setSize(50, 50);
    store().setCenter({ lat: 49, lng: 30 });
    store().setLayoutKind('separate');
    store().clearPoints();
    store().setDrawing(true);
    expect(store().widthKm).toBe(200);
    expect(store().center).toBeNull();
    expect(store().layoutKind).toBe('single');
    expect(store().points).toHaveLength(1);
    expect(store().drawing).toBe(false);
  });

  it('adopts the server snapshot after a reconnect', () => {
    store().apply({
      type: 'mission_snapshot',
      running: true,
      droneCount: 5,
      drones: [{ droneId: 'drone-1', callsign: 'BA-01', status: 'idle', progress: 100, position: { lat: 50, lng: 30 }, heading: 10, altitudeM: 210, groundM: 150, speedMs: 0, batteryPct: 99, crabDeg: 0, altitudeAglM: 60, cruiseSpeedMs: 10, trail: [], tasks: [] }],
    });
    expect(store().phase).toBe('running');
    expect(store().droneCount).toBe(5);
    expect(store().drones['drone-1']).toMatchObject({ callsign: 'BA-01', status: 'idle', altitudeM: 210 });
    store().apply({ type: 'mission_snapshot', running: false, droneCount: 0, drones: [] });
    expect(store().phase).toBe('idle');
    expect(store().drones).toEqual({});
    expect(store().droneCount).toBe(5); // the operator's choice is kept when no mission runs
  });
});
