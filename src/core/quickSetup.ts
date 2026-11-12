import type { AppData, BlendComponent, DoseUnit, Peptide, Protocol, ScheduleRule, Vial } from './types';
import { calculateDose, convertDose } from './math';

export type QuickSetupContainerInput =
  | { kind: 'powder'; amount: number; unit: DoseUnit; volumeML: number }
  | { kind: 'pen'; amount: number; unit: DoseUnit; volumeML: number; totalClicks?: number }
  | { kind: 'none' };

export interface QuickSetupInput {
  name: string; color: string;
  container: QuickSetupContainerInput;
  doseAmount: number; doseUnit: DoseUnit;
  rule: ScheduleRule; minuteOfDay: number; startDay: string;
  /** Blend: total content per component. The dose is then in units (U-100). */
  components?: BlendComponent[];
}
export interface QuickSetupIds { peptide: string; vial: string; protocol: string; plan: string }

const normalize = (value: string) => value.trim().toLocaleLowerCase();

/** The container the quick setup would reuse: the latest one for this peptide. */
export function latestVial(data: AppData, peptideName: string): Vial | undefined {
  const peptide = data.peptides.find(p => normalize(p.name) === normalize(peptideName));
  return peptide ? data.vials.filter(v => v.peptideId === peptide.id).at(-1) : undefined;
}

/** A blend vial's total: the sum when all components share a unit, else the first component. */
export function blendVialContent(components: BlendComponent[]): { amount: number; unit: DoseUnit } {
  const unit = components[0].unit;
  return components.every(c => c.unit === unit)
    ? { amount: components.reduce((sum, c) => sum + c.amount, 0), unit }
    : { amount: components[0].amount, unit };
}

/**
 * Blend draw: the amount is chosen for one component; every component scales with the same volume.
 * Returns the units to draw, the volume, doses per vial and what each component gives per dose.
 */
export function blendDraw(components: BlendComponent[], waterML: number, index: number, amount: number, unit: DoseUnit) {
  const steer = components[index];
  const converted = steer ? convertDose(amount, unit, steer.unit) : null;
  const result = converted === null ? null : calculateDose(steer.amount, waterML, converted);
  if (!result) return null;
  const fraction = result.volumeML / waterML;
  return { ...result, perDose: components.map(c => ({ ...c, amount: c.amount * fraction })), tooMuch: converted! > steer.amount + 1e-9 };
}

/**
 * One step: peptide (found or created), optional container (reused when identical,
 * else created on the start day) and a single-item plan linked when a container exists.
 */
export function quickSetup(data: AppData, input: QuickSetupInput, ids: QuickSetupIds): AppData {
  const name = input.name.trim();
  let peptides = data.peptides;
  let peptide: Peptide | undefined = peptides.find(p => normalize(p.name) === normalize(name));
  if (!peptide) {
    peptide = { id: ids.peptide, name, color: input.color, notes: '', ...(input.components?.length ? { components: input.components } : {}) };
    peptides = [...peptides, peptide];
  } else if (input.components?.length && !peptide.components?.length) {
    // Fill in components once; recorded components are never changed as a side effect.
    const updated: Peptide = { ...peptide, components: input.components };
    peptides = peptides.map(p => p.id === updated.id ? updated : p);
    peptide = updated;
  }
  const peptideId = peptide.id;
  let vials = data.vials;
  let vial: Vial | undefined;
  if (input.container.kind !== 'none') {
    const container = input.container;
    vial = vials.find(v => v.peptideId === peptideId && v.kind === container.kind && v.amount === container.amount
      && v.unit === container.unit && v.volumeML === container.volumeML
      && (v.totalClicks ?? undefined) === (container.kind === 'pen' ? container.totalClicks : undefined)
      && !(v.expiresAt && v.expiresAt < input.startDay));
    if (!vial) {
      vial = {
        id: ids.vial, peptideId, kind: container.kind, amount: container.amount, unit: container.unit,
        volumeML: container.volumeML, preparedAt: input.startDay, expiresAt: null,
        ...(container.kind === 'pen' && container.totalClicks !== undefined ? { totalClicks: container.totalClicks } : {}),
      };
      vials = [...vials, vial];
    }
  }
  const protocol: Protocol = {
    id: ids.protocol, peptideId, name: peptide.name, planId: ids.plan, planName: peptide.name,
    startDay: input.startDay, endDay: null, rule: input.rule,
    phases: [{ id: ids.protocol, amount: input.doseAmount, unit: input.doseUnit, durationDays: null }],
    reminderMinuteOfDay: input.minuteOfDay, isActive: true, ...(vial ? { vialId: vial.id } : {}),
  };
  return { ...data, peptides, vials, protocols: [...data.protocols, protocol] };
}
