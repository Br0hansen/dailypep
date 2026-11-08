import { describe, expect, it } from 'vitest';
import { addDays, dayIndex, isDay, plannedDose, plannedDoses, todayDay } from './schedule';
import type { Protocol } from './types';

const protocol = (changes: Partial<Protocol> = {}): Protocol => ({
  id: 'p', peptideId: 'pep', name: 'User plan', startDay: '2026-03-27', endDay: null,
  rule: { kind: 'interval', days: 2 }, phases: [{ id: 'f', durationDays: null, amount: 1, unit: 'mg' }],
  reminderMinuteOfDay: 480, isActive: true, ...changes,
});
describe('calendar dates', () => {
  it('handles daylight saving, leap days and month/year boundaries as calendar days', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(dayIndex('2026-03-30', '2026-03-28')).toBe(2);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('rejects dates that JavaScript would silently roll into another month', () => {
    expect(isDay('2026-02-29')).toBe(false);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay('2026-1-01')).toBe(false);
    expect(isDay('2028-02-29')).toBe(true);
  });
  it('uses local calendar components for today', () => {
    expect(todayDay(new Date(2026, 0, 1, 0, 15))).toBe('2026-01-01');
  });
});
describe('fixed schedules', () => {
  it('anchors intervals to start date across DST; missing logs cannot move the schedule', () => {
    expect(plannedDoses(protocol(), '2026-03-26', '2026-04-02').map(d => d.day))
      .toEqual(['2026-03-27', '2026-03-29', '2026-03-31', '2026-04-02']);
  });
  it('includes an explicit last day and excludes inactive protocols', () => {
    expect(plannedDose(protocol({ endDay: '2026-03-29' }), '2026-03-29')).not.toBeNull();
    expect(plannedDose(protocol({ endDay: '2026-03-29' }), '2026-03-31')).toBeNull();
    expect(plannedDose(protocol({ isActive: false }), '2026-03-27')).toBeNull();
  });
  it('uses Sunday=0 for weekdays and respects the start date', () => {
    const p = protocol({ rule: { kind: 'weekdays', days: [0, 1] } });
    expect(plannedDoses(p, '2026-03-23', '2026-03-30').map(d => d.day)).toEqual(['2026-03-29', '2026-03-30']);
  });
  it('repeats on/off cycles from the original start', () => {
    const p = protocol({ rule: { kind: 'cycle', daysOn: 2, daysOff: 2 } });
    expect(plannedDoses(p, '2026-03-27', '2026-04-01').map(d => d.day))
      .toEqual(['2026-03-27', '2026-03-28', '2026-03-31', '2026-04-01']);
  });
  it('changes phases by elapsed calendar days, including days without a dose', () => {
    const p = protocol({ phases: [
      { id: '1', durationDays: 3, amount: 1, unit: 'mg' },
      { id: '2', durationDays: 3, amount: 2, unit: 'mg' },
    ] });
    expect(plannedDose(p, '2026-03-29')?.amount).toBe(1);
    expect(plannedDose(p, '2026-03-31')?.amount).toBe(2);
    expect(plannedDose(p, '2026-04-02')).toBeNull();
  });
  it('rejects malformed intervals and ranges', () => {
    expect(plannedDose(protocol({ rule: { kind: 'interval', days: 0 } }), '2026-03-27')).toBeNull();
    expect(plannedDoses(protocol(), '2026-04-02', '2026-03-27')).toEqual([]);
  });
});
