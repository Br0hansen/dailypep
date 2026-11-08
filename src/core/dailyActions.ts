import type { AppData, Day, InjectionLog, PlannedDose, Protocol, Vial } from './types';
import { addDays, dayIndex, plannedDose } from './schedule';
import { calculateDose, convertDose, vialRemaining } from './math';

/** The first scheduled day on/after from; it never shifts the original grid. */
export function nextScheduledDose(protocol: Protocol, from: Day): PlannedDose | null {
  if (!protocol.isActive) return null;
  let day = from < protocol.startDay ? protocol.startDay : from;
  const index = dayIndex(day, protocol.startDay);
  const rule = protocol.rule;
  if (rule.kind === 'interval') {
    if (!Number.isSafeInteger(rule.days) || rule.days < 1) return null;
    day = addDays(day, (rule.days - index % rule.days) % rule.days);
  } else if (rule.kind === 'weekdays') {
    let shift = 0;
    while (shift < 7 && !rule.days.includes(new Date(`${addDays(day, shift)}T12:00:00Z`).getUTCDay())) shift++;
    if (shift === 7) return null;
    day = addDays(day, shift);
  } else {
    if (rule.daysOn < 1 || rule.daysOff < 0) return null;
    const position = index % (rule.daysOn + rule.daysOff);
    if (position >= rule.daysOn) day = addDays(day, rule.daysOn + rule.daysOff - position);
  }
  return plannedDose(protocol, day);
}
export function isLastScheduledDose(protocol: Protocol, dose: PlannedDose): boolean {
  // Finite phase duration can end a plan even without an explicit end date.
  const finite = protocol.phases.every(phase => phase.durationDays !== null);
  return Boolean((protocol.endDay || finite) && !nextScheduledDose(protocol, addDays(dose.day, 1)));
}

/** One explicit source of container math, shared by quick logging and details. */
export function doseContainer(data: AppData, protocol: Protocol, amount: number, unit: PlannedDose['unit'], day: Day, chosenVialId?: string, excludingLogId?: string) {
  const vialId = chosenVialId ?? protocol.vialId;
  const vial = vialId ? data.vials.find(item => item.id === vialId && item.peptideId === protocol.peptideId) : undefined;
  if (!vial) return null;
  const remaining = vialRemaining(vial, excludingLogId ? data.logs.filter(log => log.id !== excludingLogId) : data.logs);
  const converted = convertDose(amount, unit, vial.unit);
  const calculation = unit === 'units'
    ? { units: amount, volumeML: amount / 100 }
    : converted === null ? null : calculateDose(vial.amount, vial.volumeML, converted);
  const consumed = converted ?? (unit === 'units' ? amount / 100 / vial.volumeML * vial.amount : null);
  return {
    vial, remaining, calculation,
    expired: Boolean(vial.expiresAt && vial.expiresAt < day),
    futurePrepared: Boolean(vial.preparedAt && vial.preparedAt > day),
    insufficient: remaining !== null && consumed !== null && remaining + 1e-9 < consumed,
    incompatible: calculation === null,
  };
}

/** Atomic updater: another tab or a second tap must never replace an existing log. */
export function recordScheduledDose(data: AppData, protocolId: string, day: Day, id: string, timestamp: string): AppData {
  if (data.logs.some(log => log.protocolId === protocolId && log.day === day)) return data;
  const protocol = data.protocols.find(item => item.id === protocolId);
  const dose = protocol && plannedDose(protocol, day);
  if (!protocol || !dose) throw new Error('This scheduled entry has changed. Reopen it before logging.');
  const vial: Vial | undefined = protocol.vialId ? data.vials.find(item => item.id === protocol.vialId && item.peptideId === protocol.peptideId) : undefined;
  const log: InjectionLog = { id, protocolId, day, amount: dose.amount, unit: dose.unit, status: 'taken', timestamp, note: '', ...(vial ? { vialId: vial.id } : {}) };
  return { ...data, logs: [...data.logs, log] };
}
