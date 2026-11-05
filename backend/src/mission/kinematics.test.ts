import { describe, expect, it } from 'vitest';
import { formationTargets, stepToward } from './kinematics';
import { toMetersFrom } from '../../../shared/mission/area';

const a = { lat: 50, lng: 30 };

describe('stepToward', () => {
  it('moves at most maxStepM toward the target and reports the heading', () => {
    const b = { lat: 50.01, lng: 30 }; // ~1.1 km north
    const step = stepToward(a, b, 10);
    expect(step.arrived).toBe(false);
    expect(toMetersFrom(a, step.position).north).toBeCloseTo(10, 0);
    expect(step.heading).toBeCloseTo(0, 5);
  });

  it('arrives exactly when the target is within one step', () => {
    const b = { lat: 50.00005, lng: 30 }; // ~5.6 m north
    expect(stepToward(a, b, 10)).toMatchObject({ position: b, arrived: true });
  });
});

describe('formationTargets', () => {
  it('spreads drones on the east–west line around the center', () => {
    const [left, mid, right] = formationTargets(a, 3);
    expect(toMetersFrom(a, mid).east).toBeCloseTo(0, 0);
    expect(toMetersFrom(a, left).east).toBeCloseTo(-150, 0);
    expect(toMetersFrom(a, right).east).toBeCloseTo(150, 0);
  });
});
