import { convertDose } from './math';
import type { BlendComponent, DoseUnit } from './types';

export type ContentUnit = Exclude<DoseUnit, 'units'>;
export type DrawScale = { kind: 'u100' } | { kind: 'clicks'; marksPerML: number };
export interface DrawResult {
  doseVolumeML: number;
  drawMarks: number;
  wholeDoses: number;
  fractionOfVial: number;
}
export interface ReconstitutionResult extends DrawResult { liquidVolumeML: number }
const positiveFinite = (value: number) => Number.isFinite(value) && value > 0;
export function drawMarksPerML(scale: DrawScale): number | null {
  return scale.kind === 'u100' ? 100 : positiveFinite(scale.marksPerML) ? scale.marksPerML : null;
}
function contentFraction(content: number, contentUnit: ContentUnit, dose: number, doseUnit: ContentUnit): number | null {
  if (!positiveFinite(content) || !positiveFinite(dose)) return null;
  const converted = convertDose(dose, doseUnit, contentUnit);
  if (converted === null || !positiveFinite(converted) || converted > content) return null;
  const fraction = converted / content;
  return positiveFinite(fraction) ? fraction : null;
}
function drawResult(fraction: number, volumeML: number, rate: number): DrawResult | null {
  const doseVolumeML = volumeML * fraction;
  const drawMarks = doseVolumeML * rate;
  const wholeDoses = Math.floor(1 / fraction + 1e-9);
  if (![doseVolumeML, drawMarks, wholeDoses].every(positiveFinite)) return null;
  return { doseVolumeML, drawMarks, wholeDoses, fractionOfVial: fraction };
}
/** A user's dose converted to volume and an explicitly chosen scale. */
export function calculateDraw(content: number, contentUnit: ContentUnit, volumeML: number, dose: number, doseUnit: ContentUnit, scale: DrawScale): DrawResult | null {
  const fraction = contentFraction(content, contentUnit, dose, doseUnit);
  const rate = drawMarksPerML(scale);
  return fraction === null || rate === null || !positiveFinite(volumeML) ? null : drawResult(fraction, volumeML, rate);
}
/** Required total liquid volume, from content + own dose + desired draw. No dose is suggested. */
export function calculateReconstitution(content: number, contentUnit: ContentUnit, dose: number, doseUnit: ContentUnit, desiredMarks: number, scale: DrawScale): ReconstitutionResult | null {
  const fraction = contentFraction(content, contentUnit, dose, doseUnit);
  const rate = drawMarksPerML(scale);
  if (fraction === null || rate === null || !positiveFinite(desiredMarks)) return null;
  const liquidVolumeML = desiredMarks / rate / fraction;
  if (!positiveFinite(liquidVolumeML)) return null;
  const result = drawResult(fraction, liquidVolumeML, rate);
  return result ? { ...result, liquidVolumeML } : null;
}
function validComponents(components: BlendComponent[]): boolean {
  return components.length > 0 && components.every(component => component.name.trim() && positiveFinite(component.amount) && component.unit !== 'units');
}
export interface BlendDrawResult extends DrawResult { components: BlendComponent[] }
export interface BlendReconstitutionResult extends BlendDrawResult { liquidVolumeML: number }
/** The same vial fraction applies to every component; units stay attached to each amount. */
export function calculateBlendDraw(components: BlendComponent[], liquidVolumeML: number, desiredMarks: number, scale: DrawScale): BlendDrawResult | null {
  const rate = drawMarksPerML(scale);
  if (!validComponents(components) || rate === null || !positiveFinite(liquidVolumeML) || !positiveFinite(desiredMarks)) return null;
  const fraction = desiredMarks / rate / liquidVolumeML;
  if (!positiveFinite(fraction) || fraction > 1) return null;
  const result = drawResult(fraction, liquidVolumeML, rate);
  if (!result) return null;
  const amounts = components.map(component => ({ ...component, amount: component.amount * fraction }));
  return amounts.every(component => positiveFinite(component.amount)) ? { ...result, components: amounts } : null;
}
/** One selected component defines the target. All others follow the entered fixed mixture ratio. */
export function calculateBlendReconstitution(components: BlendComponent[], referenceIndex: number, referenceDose: number, referenceUnit: ContentUnit, desiredMarks: number, scale: DrawScale): BlendReconstitutionResult | null {
  if (!validComponents(components) || !Number.isInteger(referenceIndex)) return null;
  const reference = components[referenceIndex];
  if (!reference || reference.unit === 'units') return null;
  const result = calculateReconstitution(reference.amount, reference.unit, referenceDose, referenceUnit, desiredMarks, scale);
  if (!result) return null;
  const amounts = components.map(component => ({ ...component, amount: component.amount * result.fractionOfVial }));
  return amounts.every(component => positiveFinite(component.amount)) ? { ...result, components: amounts } : null;
}
