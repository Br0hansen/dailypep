import type { BlendComponent, Day, PeptideNeed, Protocol } from './types';
import { plannedDoses } from './schedule';
import { blendPerDose, convertDose } from './math';

export function mergeNeeds(needs: PeptideNeed[]): PeptideNeed[] {
  const totals = new Map<string, PeptideNeed>();
  for (const need of needs) {
    const mass = convertDose(need.totalAmount, need.unit, 'mcg');
    const unit = mass === null ? need.unit : 'mcg';
    const key = JSON.stringify([need.name, unit]);
    const previous = totals.get(key);
    totals.set(key, { name: need.name, totalAmount: (previous?.totalAmount ?? 0) + (mass ?? need.totalAmount), unit });
  }
  return [...totals.values()].map(need => need.unit === 'mcg' && need.totalAmount >= 1000
    ? { ...need, totalAmount: need.totalAmount / 1000, unit: 'mg' as const } : need)
    .sort((a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit));
}
export function cycleNeeds(name: string, protocol: Protocol, from: Day, through: Day, components: BlendComponent[] = [], volumeML?: number): PeptideNeed[] {
  const doses = plannedDoses(protocol, from, through);
  if (components.length) {
    if (!volumeML || doses.some(d => d.unit !== 'units')) return [];
    const result = blendPerDose(components, volumeML, doses.reduce((sum, d) => sum + d.amount, 0));
    return result?.map(c => ({ name: c.name, totalAmount: c.amount, unit: c.unit })) ?? [];
  }
  return mergeNeeds(doses.map(dose => ({ name, totalAmount: dose.amount, unit: dose.unit })));
}
