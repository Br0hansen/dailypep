import { describe, expect, it } from 'vitest';
import { groupPlans } from './plans';
import type { Protocol } from './types';

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
