import { describe, expect, it } from 'vitest';
import { emptyData, exportData, importData, validateData } from './validation';
import type { AppData } from '../core/types';

function legacyWorkspace(): AppData {
  return { ...emptyData(),
    peptides: [{ id: 'p', name: 'User entry', color: '#59e0ba', notes: '' }, { id: 'other', name: 'Other user entry', color: '#59e0ba', notes: '' }],
    protocols: [{ id: 'protocol', peptideId: 'p', name: 'User plan', startDay: '2026-11-08', endDay: null,
      rule: { kind: 'interval', days: 1 }, phases: [{ id: 'phase', durationDays: null, amount: 1, unit: 'mg' }], reminderMinuteOfDay: 480, isActive: true }],
    vials: [{ id: 'vial', peptideId: 'p', kind: 'pen', amount: 10, unit: 'mg', volumeML: 3, preparedAt: null, expiresAt: null },
      { id: 'other-vial', peptideId: 'other', kind: 'pen', amount: 10, unit: 'mg', volumeML: 3, preparedAt: null, expiresAt: null }],
    logs: [{ id: 'log', protocolId: 'protocol', day: '2026-11-08', amount: 1, unit: 'mg', status: 'taken', timestamp: '2026-11-08T08:00:00Z', note: '' }],
    cycles: [{ id: 'template', name: 'User template', lastStartedAt: null, items: [{ id: 'item', peptideName: 'User entry', color: '#59e0ba', amount: 1, unit: 'mg', rule: { kind: 'interval', days: 1 }, weeks: 2,
      phases: [{ id: 'template-phase', amount: 1, unit: 'mg', durationDays: null }] }] }],
  };
}

describe('validated backup format', () => {
  it('round trips an empty workspace without inventing records', () => {
    expect(importData(exportData(emptyData()))).toEqual(emptyData());
  });
  it('rejects future versions and invalid JSON', () => {
    expect(() => importData('{')).toThrow('JSON');
    expect(() => validateData({ ...emptyData(), version: 2 })).toThrow('version');
  });
  it('rejects non-finite measurements, malformed dates and orphaned references', () => {
    const measurement = { id: 'm', day: '2026-11-08', name: 'Weight', value: 90, unit: 'kg', note: '', category: 'body' };
    expect(() => validateData({ ...emptyData(), measurements: [{ ...measurement, value: NaN }] })).toThrow();
    expect(() => validateData({ ...emptyData(), measurements: [{ ...measurement, day: '2026-02-31' }] })).toThrow();
    expect(() => validateData({ ...emptyData(), vials: [{ id: 'v', peptideId: 'missing', kind: 'pen', amount: 3, unit: 'mg', volumeML: 3, preparedAt: null, expiresAt: null }] })).toThrow('missing records');
  });
  it('returns an independent copy rather than mutable input', () => {
    const original = emptyData();
    const copy = validateData(original);
    copy.settings.language = 'nb';
    expect(original.settings.language).toBe('en');
  });
  it('round trips existing records without inventing plan links or changing log IDs', () => {
    const original = legacyWorkspace();
    const result = importData(exportData(original));
    expect(result).toEqual(original);
    expect(result.protocols[0]).not.toHaveProperty('planId');
    expect(result.protocols[0]).not.toHaveProperty('vialId');
    expect(result.logs[0].id).toBe('log');
    expect(result.cycles[0].items[0]).not.toHaveProperty('durationDays');
    expect(result.cycles[0].items[0]).not.toHaveProperty('startOffsetDays');
    expect(result.cycles[0].items[0]).not.toHaveProperty('components');
  });
  it('accepts explicit plan links and exact or open template durations', () => {
    const data = legacyWorkspace();
    Object.assign(data.protocols[0], { planId: 'plan', planName: 'Combined plan', vialId: 'vial' });
    data.cycles[0].items[0].durationDays = 9;
    expect(validateData(data).cycles[0].items[0].durationDays).toBe(9);
    data.cycles[0].items[0].durationDays = null;
    expect(validateData(data).cycles[0].items[0].durationDays).toBe(null);
  });
  it('preserves explicit relative template starts and rejects invalid offsets', () => {
    const data = legacyWorkspace();
    data.cycles[0].items[0].startOffsetDays = 9;
    expect(importData(exportData(data)).cycles[0].items[0].startOffsetDays).toBe(9);
    data.cycles[0].items[0].startOffsetDays = 0;
    expect(validateData(data).cycles[0].items[0].startOffsetDays).toBe(0);
    for (const offset of [-1, 0.5, 36_601, Number.POSITIVE_INFINITY]) {
      data.cycles[0].items[0].startOffsetDays = offset;
      expect(() => validateData(data)).toThrow();
    }
  });
  it('round trips user-entered template blend components with their separate units', () => {
    const data = legacyWorkspace();
    data.cycles[0].items[0].components = [
      { name: 'Own component A', amount: 10, unit: 'mg' },
      { name: 'Own component B', amount: 250, unit: 'mcg' },
      { name: 'Own component C', amount: 2, unit: 'iu' },
    ];
    expect(importData(exportData(data)).cycles[0].items[0].components).toEqual(data.cycles[0].items[0].components);
    for (const invalid of [[], [{ name: '', amount: 1, unit: 'mg' }], [{ name: 'A', amount: 0, unit: 'mg' }], [{ name: 'A', amount: 1, unit: 'units' }]]) {
      const input = structuredClone(data);
      (input.cycles[0].items[0] as unknown as { components: unknown }).components = invalid;
      expect(() => validateData(input)).toThrow();
    }
  });
  it('rejects missing or cross-peptide links for planned and logged containers', () => {
    const data = legacyWorkspace();
    data.protocols[0].vialId = 'missing';
    expect(() => validateData(data)).toThrow('missing records');
    data.protocols[0].vialId = 'other-vial';
    expect(() => validateData(data)).toThrow('different peptide');
    data.protocols[0].vialId = 'vial';
    data.logs[0].vialId = 'other-vial';
    expect(() => validateData(data)).toThrow('different peptide');
    data.logs[0].vialId = 'vial';
    expect(validateData(data).logs[0].vialId).toBe('vial');
  });
  it('rejects empty grouping IDs and unbounded imported schedule periods', () => {
    const data = legacyWorkspace();
    data.protocols[0].planId = '';
    expect(() => validateData(data)).toThrow();
    delete data.protocols[0].planId;
    data.cycles[0].items[0].durationDays = Number.MAX_SAFE_INTEGER;
    expect(() => validateData(data)).toThrow();
    data.cycles[0].items[0].durationDays = 10;
    data.protocols[0].rule = { kind: 'cycle', daysOn: 36_600, daysOff: 36_600 };
    expect(() => validateData(data)).toThrow();
  });
});

