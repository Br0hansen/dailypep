import { describe, expect, it } from 'vitest';
import { calculateBlendDraw, calculateBlendReconstitution, calculateDraw, calculateReconstitution, drawMarksPerML } from './reconstitution';
import type { BlendComponent } from './types';

describe('user-defined reconstitution and draw scale', () => {
  it('computes liquid for a user-selected 6 U draw without changing their dose', () => {
    const result = calculateReconstitution(10, 'mg', 0.25, 'mg', 6, { kind: 'u100' });
    expect(result?.liquidVolumeML).toBeCloseTo(2.4);
    expect(result?.doseVolumeML).toBeCloseTo(0.06);
    expect(result?.drawMarks).toBeCloseTo(6);
    expect(result?.wholeDoses).toBe(40);
    expect(calculateDraw(10, 'mg', result!.liquidVolumeML, 0.25, 'mg', { kind: 'u100' })?.drawMarks).toBeCloseTo(6);
  });
  it('converts mcg into the entered vial mass unit, but never invents IU equivalence', () => {
    expect(calculateReconstitution(10, 'mg', 250, 'mcg', 6, { kind: 'u100' })?.liquidVolumeML).toBeCloseTo(2.4);
    expect(calculateReconstitution(10, 'mg', 2, 'iu', 6, { kind: 'u100' })).toBeNull();
    expect(calculateReconstitution(100, 'iu', 5, 'iu', 6, { kind: 'u100' })?.liquidVolumeML).toBeCloseTo(1.2);
  });
  it('requires explicit pen calibration and distinguishes clicks from U-100 units', () => {
    expect(drawMarksPerML({ kind: 'clicks', marksPerML: 0 })).toBeNull();
    expect(calculateReconstitution(10, 'mg', 0.25, 'mg', 6, { kind: 'clicks', marksPerML: NaN })).toBeNull();
    expect(calculateReconstitution(10, 'mg', 0.25, 'mg', 6, { kind: 'clicks', marksPerML: 200 })?.liquidVolumeML).toBeCloseTo(1.2);
    expect(calculateDraw(10, 'mg', 2, 0.25, 'mg', { kind: 'clicks', marksPerML: 200 })?.drawMarks).toBeCloseTo(10);
  });
  it('rejects invalid, impossible, or overflowed quantities', () => {
    expect(calculateReconstitution(0, 'mg', 0.25, 'mg', 6, { kind: 'u100' })).toBeNull();
    expect(calculateReconstitution(1, 'mg', 2, 'mg', 6, { kind: 'u100' })).toBeNull();
    expect(calculateReconstitution(10, 'mg', 0.25, 'mg', -1, { kind: 'u100' })).toBeNull();
    expect(calculateReconstitution(Number.MAX_VALUE, 'mg', Number.MIN_VALUE, 'mg', 6, { kind: 'u100' })).toBeNull();
    expect(calculateDraw(10, 'mg', NaN, 1, 'mg', { kind: 'u100' })).toBeNull();
  });
});
describe('blend proportions', () => {
  const components: BlendComponent[] = [{ name: 'User component A', amount: 10, unit: 'mg' }, { name: 'User component B', amount: 5, unit: 'mg' }, { name: 'User component C', amount: 100, unit: 'iu' }];
  it('shows each component separately for the same user-entered draw', () => {
    const result = calculateBlendDraw(components, 2, 10, { kind: 'u100' });
    expect(result?.components.map(component => component.amount)).toEqual([0.5, 0.25, 5]);
    expect(result?.components.map(component => component.unit)).toEqual(['mg', 'mg', 'iu']);
    expect(result?.wholeDoses).toBe(20);
  });
  it('uses one reference component for inverse recon and preserves the fixed ratio', () => {
    const result = calculateBlendReconstitution(components, 0, 250, 'mcg', 6, { kind: 'u100' });
    expect(result?.liquidVolumeML).toBeCloseTo(2.4);
    expect(result?.components.map(component => component.amount)).toEqual([0.25, 0.125, 2.5]);
  });
  it('does not accept an incompatible reference unit or a draw larger than the vial', () => {
    expect(calculateBlendReconstitution(components, 0, 1, 'iu', 6, { kind: 'u100' })).toBeNull();
    expect(calculateBlendReconstitution(components, 99, 1, 'mg', 6, { kind: 'u100' })).toBeNull();
    expect(calculateBlendDraw(components, 2, 300, { kind: 'u100' })).toBeNull();
    expect(calculateBlendDraw([{ name: 'A', amount: 1, unit: 'units' }], 2, 6, { kind: 'u100' })).toBeNull();
  });
});
