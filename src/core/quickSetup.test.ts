import { describe, expect, it } from 'vitest';
import { latestVial, quickSetup, type QuickSetupInput } from './quickSetup';
import { doseContainer } from './dailyActions';
import { emptyData, validateData } from '../data/validation';

const input: QuickSetupInput = {
  name: 'BPC-157', color: '#59e0ba', vialAmount: 5, vialUnit: 'mg', waterML: 2,
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
    const second = quickSetup(first, { ...input, waterML: 3 }, { peptide: 'p2', vial: 'v2', protocol: 'pr2', plan: 'plan2' });
    expect(second.vials.map(v => v.id)).toEqual(['v1', 'v2']);
    expect(second.protocols[1].vialId).toBe('v2');
    expect(latestVial(second, 'BPC-157')?.id).toBe('v2');
  });
});
