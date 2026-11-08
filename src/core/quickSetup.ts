import type { AppData, DoseUnit, Peptide, Protocol, ScheduleRule, Vial } from './types';

export interface QuickSetupInput {
  name: string; color: string;
  vialAmount: number; vialUnit: DoseUnit; waterML: number;
  doseAmount: number; doseUnit: DoseUnit;
  rule: ScheduleRule; minuteOfDay: number; startDay: string;
}
export interface QuickSetupIds { peptide: string; vial: string; protocol: string; plan: string }

const normalize = (value: string) => value.trim().toLocaleLowerCase();

/** The container the quick setup would reuse: the latest one for this peptide. */
export function latestVial(data: AppData, peptideName: string): Vial | undefined {
  const peptide = data.peptides.find(p => normalize(p.name) === normalize(peptideName));
  return peptide ? data.vials.filter(v => v.peptideId === peptide.id).at(-1) : undefined;
}

/**
 * One step: peptide (found or created), powder vial (reused when identical, else created
 * as mixed on the start day) and a single-item plan linked to that vial.
 */
export function quickSetup(data: AppData, input: QuickSetupInput, ids: QuickSetupIds): AppData {
  const name = input.name.trim();
  let peptides = data.peptides;
  let peptide: Peptide | undefined = peptides.find(p => normalize(p.name) === normalize(name));
  if (!peptide) {
    peptide = { id: ids.peptide, name, color: input.color, notes: '' };
    peptides = [...peptides, peptide];
  }
  const peptideId = peptide.id;
  let vials = data.vials;
  let vial = vials.find(v => v.peptideId === peptideId && v.kind === 'powder' && v.amount === input.vialAmount
    && v.unit === input.vialUnit && v.volumeML === input.waterML && !(v.expiresAt && v.expiresAt < input.startDay));
  if (!vial) {
    vial = { id: ids.vial, peptideId, kind: 'powder', amount: input.vialAmount, unit: input.vialUnit, volumeML: input.waterML, preparedAt: input.startDay, expiresAt: null };
    vials = [...vials, vial];
  }
  const protocol: Protocol = {
    id: ids.protocol, peptideId, name: peptide.name, planId: ids.plan, planName: peptide.name,
    startDay: input.startDay, endDay: null, rule: input.rule,
    phases: [{ id: ids.protocol, amount: input.doseAmount, unit: input.doseUnit, durationDays: null }],
    reminderMinuteOfDay: input.minuteOfDay, isActive: true, vialId: vial.id,
  };
  return { ...data, peptides, vials, protocols: [...data.protocols, protocol] };
}
