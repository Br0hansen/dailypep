import { describe, expect, it } from 'vitest';
import { deletePlan, groupPlans } from './plans';
import { emptyData, validateData } from '../data/validation';
import type { AppData, Protocol } from './types';

const protocol = (id: string, extra: Partial<Protocol> = {}): Protocol => ({
  id, peptideId: 'peptide', name: `Own plan ${id}`, startDay: '2026-11-08', endDay: null,
  rule: { kind: 'interval', days: 1 }, phases: [{ id: 'phase', amount: 1, unit: 'mg', durationDays: null }],
  reminderMinuteOfDay: 480, isActive: true, ...extra,
});

describe('unified plan grouping', () => {
  it('keeps legacy records separate even when they have identical names', () => {
    const first = protocol('first', { name: 'Same user label' });
    const second = protocol('second', { name: 'Same user label' });
    expect(groupPlans([first, second])).toEqual([
      { id: 'first', name: 'Same user label', protocols: [first] },
      { id: 'second', name: 'Same user label', protocols: [second] },
    ]);
  });
  it('groups explicit plan members without discarding inactive records or changing IDs', () => {
    const first = protocol('first', { planId: 'combined', planName: 'My combined plan' });
    const second = protocol('second', { planId: 'combined', planName: 'My combined plan', isActive: false });
    const unrelated = protocol('third');
    const groups = groupPlans([first, unrelated, second]);
    expect(groups[0]).toEqual({ id: 'combined', name: 'My combined plan', protocols: [first, second] });
    expect(groups[1].protocols).toEqual([unrelated]);
    expect(first.id).toBe('first');
    expect(second.isActive).toBe(false);
  });
  it('creates independent group containers without mutating the source list', () => {
    const protocols = [protocol('first')];
    const groups = groupPlans(protocols);
    groups[0].protocols.push(protocol('second'));
    expect(protocols).toHaveLength(1);
  });
});

describe('deleting a plan', () => {
  it('removes its plan items but keeps the logs, stamped with the peptide name, and leaves other plans alone', () => {
    const data: AppData = { ...emptyData(),
      peptides: [{ id: 'peptide', name: 'DSIP', color: '#59e0ba', notes: '' }],
      protocols: [protocol('first', { planId: 'evening' }), protocol('second', { planId: 'evening' }), protocol('other')],
      vials: [{ id: 'vial', peptideId: 'peptide', kind: 'pen', amount: 5, unit: 'mg', volumeML: 3, preparedAt: null, expiresAt: null }],
      logs: [
        { id: 'a', protocolId: 'first', day: '2026-11-08', amount: 1, unit: 'mg', status: 'taken', timestamp: '2026-11-08T21:00:00Z', note: '', vialId: 'vial' },
        { id: 'b', protocolId: 'other', day: '2026-11-08', amount: 1, unit: 'mg', status: 'taken', timestamp: '2026-11-08T08:00:00Z', note: '' },
      ] };
    const result = deletePlan(data, ['first', 'second']);
    expect(result.protocols.map(p => p.id)).toEqual(['other']);
    expect(result.logs).toHaveLength(2);
    expect(result.logs[0]).toMatchObject({ id: 'a', peptideName: 'DSIP', vialId: 'vial' });
    expect(result.logs[1].peptideName).toBeUndefined();
    expect(() => validateData(result)).not.toThrow();
  });
});
