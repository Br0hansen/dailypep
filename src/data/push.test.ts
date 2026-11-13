import { describe, expect, it, vi } from 'vitest';
import type { Protocol } from '../core/types';
import { currentTimeZone, decodeVapidPublicKey, reminderSchedules } from './push';

vi.mock('./cloud', () => ({ cloudConfigured: false, getSession: vi.fn() }));

const protocol = (changes: Partial<Protocol> = {}): Protocol => ({
  id: 'protocol-1', peptideId: 'private-peptide-id', name: 'Private name', startDay: '2026-11-13', endDay: null,
  rule: { kind: 'interval', days: 2 }, phases: [{ id: 'phase', durationDays: null, amount: 250, unit: 'mcg' }],
  reminderMinuteOfDay: 480, isActive: true, ...changes,
});

describe('push reminder data minimization', () => {
  it('uploads timing but no name, dose, note, peptide or container data', () => {
    const [schedule] = reminderSchedules([protocol({ vialId: 'private-vial' })]);
    expect(schedule).toEqual({
      protocolId: 'protocol-1', startDay: '2026-11-13', endDay: null,
      rule: { kind: 'interval', days: 2 }, minuteOfDay: 480, isActive: true,
    });
    expect(JSON.stringify(schedule)).not.toContain('Private');
    expect(JSON.stringify(schedule)).not.toContain('250');
    expect(JSON.stringify(schedule)).not.toContain('private-peptide-id');
    expect(JSON.stringify(schedule)).not.toContain('private-vial');
  });

  it('ends reminders when all phases have ended, respecting an earlier explicit end date', () => {
    expect(reminderSchedules([protocol({ phases: [
      { id: 'one', durationDays: 7, amount: 1, unit: 'mg' },
      { id: 'two', durationDays: 7, amount: 2, unit: 'mg' },
    ] })])[0].endDay).toBe('2026-11-26');
    expect(reminderSchedules([protocol({ endDay: '2026-11-20', phases: [
      { id: 'one', durationDays: 14, amount: 1, unit: 'mg' },
      { id: 'two', durationDays: 14, amount: 2, unit: 'mg' },
    ] })])[0].endDay).toBe('2026-11-20');
  });

  it('keeps an open-ended final phase open', () => {
    expect(reminderSchedules([protocol({ phases: [
      { id: 'one', durationDays: 7, amount: 1, unit: 'mg' },
      { id: 'two', durationDays: null, amount: 2, unit: 'mg' },
    ] })])[0].endDay).toBeNull();
  });
});

describe('push helpers', () => {
  it('decodes a URL-safe VAPID public key', () => {
    vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
    expect([...decodeVapidPublicKey('AQIDBA')]).toEqual([1, 2, 3, 4]);
    vi.unstubAllGlobals();
  });

  it('always returns a usable time zone', () => {
    expect(currentTimeZone()).toMatch(/\S+/);
  });
});
