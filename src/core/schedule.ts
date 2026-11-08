import type { Day, PlannedDose, Protocol } from './types';

function civilDate(day: Day): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError('Invalid calendar date');
  const [year, month, date] = day.split('-').map(Number);
  const result = new Date(0);
  result.setUTCFullYear(year, month - 1, date);
  result.setUTCHours(0, 0, 0, 0);
  if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== date) {
    throw new RangeError('Invalid calendar date');
  }
  return result;
}
export function isDay(value: unknown): value is Day {
  if (typeof value !== 'string') return false;
  try { civilDate(value); return true; } catch { return false; }
}
/** Local date is read from calendar components, never from an ISO UTC timestamp. */
export function todayDay(date = new Date()): Day {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(day: Day, count: number): Day {
  if (!Number.isSafeInteger(count)) throw new RangeError('Invalid day count');
  const date = civilDate(day);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
/** Difference of date-only Gregorian ordinals, not elapsed local time. */
export function dayIndex(day: Day, start: Day): number {
  return (civilDate(day).getTime() - civilDate(start).getTime()) / 86_400_000;
}
export function formatDay(day: Day, locale: string = 'nb-NO', options: Intl.DateTimeFormatOptions = {}): string {
  const display = Object.keys(options).length ? options : { dateStyle: 'medium' as const };
  return new Intl.DateTimeFormat(locale, { ...display, timeZone: 'UTC' }).format(civilDate(day));
}
export function plannedDose(protocol: Protocol, day: Day): PlannedDose | null {
  if (!protocol.isActive) return null;
  const index = dayIndex(day, protocol.startDay);
  if (index < 0 || (protocol.endDay !== null && day > protocol.endDay)) return null;
  const rule = protocol.rule;
  switch (rule.kind) {
    case 'interval':
      if (!Number.isSafeInteger(rule.days) || rule.days <= 0 || index % rule.days !== 0) return null;
      break;
    case 'weekdays':
      if (!rule.days.includes(civilDate(day).getUTCDay())) return null;
      break;
    case 'cycle':
      if (!Number.isSafeInteger(rule.daysOn) || !Number.isSafeInteger(rule.daysOff) || rule.daysOn <= 0 || rule.daysOff < 0 || index % (rule.daysOn + rule.daysOff) >= rule.daysOn) return null;
      break;
  }
  let offset = 0;
  for (let phaseIndex = 0; phaseIndex < protocol.phases.length; phaseIndex++) {
    const phase = protocol.phases[phaseIndex];
    if (!Number.isFinite(phase.amount) || phase.amount <= 0) return null;
    if (phase.durationDays !== null && (!Number.isSafeInteger(phase.durationDays) || phase.durationDays <= 0)) return null;
    if (phase.durationDays === null || index < offset + phase.durationDays) {
      return { protocolId: protocol.id, day, amount: phase.amount, unit: phase.unit, phaseIndex };
    }
    offset += phase.durationDays;
  }
  return null;
}
export function plannedDoses(protocol: Protocol, from: Day, through: Day): PlannedDose[] {
  const count = dayIndex(through, from);
  if (count < 0) return [];
  if (count > 36_600) throw new RangeError('Date range exceeds 100 years');
  const result: PlannedDose[] = [];
  for (let i = 0; i <= count; i++) {
    const dose = plannedDose(protocol, addDays(from, i));
    if (dose) result.push(dose);
  }
  return result;
}
