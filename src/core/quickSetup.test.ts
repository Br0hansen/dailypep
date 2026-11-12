import { describe, expect, it } from 'vitest';
import { blendDraw, blendVialContent, latestVial, quickSetup, type QuickSetupInput } from './quickSetup';
import { doseContainer } from './dailyActions';
import { emptyData, validateData } from '../data/validation';

const input: QuickSetupInput = {
  name: 'BPC-157', color: '#59e0ba', container: { kind: 'powder', amount: 5, unit: 'mg', volumeML: 2 },
  doseAmount: 250, doseUnit: 'mcg', rule: { kind: 'interval', days: 1 }, minuteOfDay: 480, startDay: '2026-11-08',
};
const ids = { peptide: 'p1', vial: 'v1', protocol: 'pr1', plan: 'plan1' };

describe('quick setup', () => {
  it('creates peptide, mixed vial and a linked plan in one valid step, giving units to draw', () => {
    const data = validateData(quickSetup(emptyData(), input, ids));
    expect(data.peptides).toEqual([{ id: 'p1', name: 'BPC-157', color: '#59e0ba', notes: '' }]);
    expect(data.vials[0]).toMatchObject({ id: 'v1', peptideId: 'p1', kind: 'powder', amount: 5, unit: 'mg', volumeML: 2, preparedAt: '2026-11-08' });
    expect(data.protocols[0]).toMatchObject({ peptideId: 'p1', vialId: 'v1', planName: 'BPC-157', startDay: '2026-11-08', endDay: null });
    const info = doseContainer(data, data.protocols[0], 250, 'mcg', '2026-11-08');
    // 5 mg in 2 ml = 2.5 mg/ml → 0.25 mg = 0.1 ml = 10 units on U-100.
    expect(info?.calculation?.units).toBeCloseTo(10);
    expect(info?.calculation?.volumeML).toBeCloseTo(0.1);
  });
  it('reuses an existing peptide (case-insensitive) and an identical vial instead of duplicating', () => {
    const first = quickSetup(emptyData(), input, ids);
    const second = validateData(quickSetup(first, { ...input, name: ' bpc-157 ', doseAmount: 500 }, { peptide: 'p2', vial: 'v2', protocol: 'pr2', plan: 'plan2' }));
    expect(second.peptides).toHaveLength(1);
    expect(second.vials).toHaveLength(1);
    expect(second.protocols.map(p => [p.peptideId, p.vialId])).toEqual([['p1', 'v1'], ['p1', 'v1']]);
    expect(latestVial(second, 'BPC-157')?.id).toBe('v1');
  });
  it('adds a new vial when the content or water differs', () => {
    const first = quickSetup(emptyData(), input, ids);
    const second = quickSetup(first, { ...input, container: { kind: 'powder', amount: 5, unit: 'mg', volumeML: 3 } }, { peptide: 'p2', vial: 'v2', protocol: 'pr2', plan: 'plan2' });
    expect(second.vials.map(v => v.id)).toEqual(['v1', 'v2']);
    expect(second.protocols[1].vialId).toBe('v2');
    expect(latestVial(second, 'BPC-157')?.id).toBe('v2');
  });
  it('creates and reuses a premixed pen with optional click metadata', () => {
    const penInput: QuickSetupInput = { ...input, container: { kind: 'pen', amount: 10, unit: 'mg', volumeML: 3, totalClicks: 300 } };
    const first = validateData(quickSetup(emptyData(), penInput, ids));
    expect(first.vials[0]).toMatchObject({ id: 'v1', kind: 'pen', amount: 10, unit: 'mg', volumeML: 3, totalClicks: 300, preparedAt: '2026-11-08' });
    expect(first.protocols[0].vialId).toBe('v1');
    const second = validateData(quickSetup(first, penInput, { peptide: 'p2', vial: 'v2', protocol: 'pr2', plan: 'plan2' }));
    expect(second.vials).toHaveLength(1);
    expect(second.protocols[1].vialId).toBe('v1');
  });
  it('creates a valid schedule without creating or linking a container', () => {
    const data = validateData(quickSetup(emptyData(), { ...input, container: { kind: 'none' } }, ids));
    expect(data.peptides).toHaveLength(1);
    expect(data.vials).toEqual([]);
    expect(data.protocols[0]).not.toHaveProperty('vialId');
    expect(data.protocols[0].phases[0]).toMatchObject({ amount: 250, unit: 'mcg' });
  });
});

describe('quick setup for blends', () => {
  const components = [{ name: 'CJC-1295 (uten DAC)', amount: 5, unit: 'mg' as const }, { name: 'Ipamorelin', amount: 5, unit: 'mg' as const }];
  it('gives units for an amount of one component and what each component gives', () => {
    // 5 mg in 2 ml = 2.5 mg/ml → 100 mcg = 0.04 ml = 4 units, and the same 100 mcg of Ipamorelin.
    const draw = blendDraw(components, 2, 0, 100, 'mcg');
    expect(draw?.units).toBeCloseTo(4);
    expect(draw?.doses).toBe(50);
    expect(draw?.perDose.map(c => c.amount)).toEqual([expect.closeTo(0.1), expect.closeTo(0.1)]);
    expect(blendDraw(components, 2, 1, 6, 'mg')?.tooMuch).toBe(true);
    expect(blendDraw([{ name: 'A', amount: 10, unit: 'iu' }], 2, 0, 100, 'mcg')).toBeNull();
  });
  it('creates the blend peptide, a vial with the summed content and a plan dosed in units', () => {
    const vial = blendVialContent(components);
    const data = validateData(quickSetup(emptyData(), { ...input, name: 'CJC-1295 + Ipamorelin', container: { kind: 'powder', amount: vial.amount, unit: vial.unit, volumeML: 2 }, doseAmount: 4, doseUnit: 'units', components }, ids));
    expect(data.peptides[0].components).toEqual(components);
    expect(data.vials[0]).toMatchObject({ amount: 10, unit: 'mg', volumeML: 2 });
    expect(data.protocols[0].phases[0]).toMatchObject({ amount: 4, unit: 'units' });
    expect(doseContainer(data, data.protocols[0], 4, 'units', '2026-11-08')?.calculation?.units).toBe(4);
  });
  it('never overwrites components already recorded on the peptide', () => {
    const first = quickSetup(emptyData(), { ...input, name: 'Wolverine', doseAmount: 4, doseUnit: 'units', components }, ids);
    const second = quickSetup(first, { ...input, name: 'Wolverine', doseAmount: 4, doseUnit: 'units', components: [{ name: 'X', amount: 1, unit: 'mg' }] }, { peptide: 'p2', vial: 'v2', protocol: 'pr2', plan: 'plan2' });
    expect(second.peptides[0].components).toEqual(components);
  });
});
