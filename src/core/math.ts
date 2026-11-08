import type { BlendComponent, Day, DoseUnit, InjectionLog, Protocol, Vial } from './types';
import { addDays, plannedDose } from './schedule';

export function convertDose(amount: number, from: DoseUnit, to: DoseUnit): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  if (from === 'mg' && to === 'mcg') return Number.isFinite(amount * 1000) ? amount * 1000 : null;
  if (from === 'mcg' && to === 'mg') return amount / 1000;
  return null;
}
export function calculateDose(vialAmount: number, volumeML: number, dose: number): { volumeML: number; units: number; doses: number } | null {
  if (![vialAmount, volumeML, dose].every(n => Number.isFinite(n) && n > 0)) return null;
  const volume = dose / (vialAmount / volumeML);
  const doses = Math.floor(vialAmount / dose + 1e-9);
  if (!Number.isFinite(volume) || !Number.isFinite(volume * 100) || !Number.isFinite(doses)) return null;
  return { volumeML: volume, units: volume * 100, doses };
}
export function blendPerDose(components: BlendComponent[], volumeML: number, syringeUnits: number): BlendComponent[] | null {
  if (!Number.isFinite(volumeML) || volumeML <= 0 || !Number.isFinite(syringeUnits) || syringeUnits <= 0 || !components.length) return null;
  if (components.some(c => !Number.isFinite(c.amount) || c.amount < 0)) return null;
  const fraction = syringeUnits / 100 / volumeML;
  return components.map(c => ({ ...c, amount: c.amount * fraction }));
}
/** Null means the entered units cannot be safely combined. */
export function vialRemaining(vial: Vial, logs: InjectionLog[]): number | null {
  let used = 0;
  for (const log of logs) {
    if (log.vialId !== vial.id || log.status !== 'taken') continue;
    let amount = convertDose(log.amount, log.unit, vial.unit);
    // U-100 is a volume scale, so use the user's own entered concentration.
    if (amount === null && log.unit === 'units' && vial.volumeML > 0) amount = log.amount / 100 / vial.volumeML * vial.amount;
    if (amount === null || amount < 0) return null;
    used += amount;
  }
  return Math.max(0, vial.amount - used);
}
export function daysUntilEmpty(remaining: number, protocols: Protocol[], vialUnit: DoseUnit, from: Day, maxDays = 365): number | null {
  if (!Number.isFinite(remaining) || !protocols.length) return null;
  if (remaining <= 0) return 0;
  let consumed = 0;
  for (let i = 0; i <= maxDays; i++) {
    for (const protocol of protocols) {
      const dose = plannedDose(protocol, addDays(from, i));
      if (!dose) continue;
      const amount = convertDose(dose.amount, dose.unit, vialUnit);
      if (amount === null) return null;
      consumed += amount;
    }
    if (consumed >= remaining - 1e-9) return i;
  }
  return null;
}
