import type { Protocol } from './types';

export interface PlanGroup { id: string; name: string; protocols: Protocol[] }

/** Existing protocols remain independent plans until the user explicitly groups them. */
export function groupPlans(protocols: readonly Protocol[]): PlanGroup[] {
  const groups = new Map<string, PlanGroup>();
  for (const protocol of protocols) {
    const id = protocol.planId ?? protocol.id;
    const group = groups.get(id);
    if (group) group.protocols.push(protocol);
    else groups.set(id, { id, name: protocol.planName ?? protocol.name, protocols: [protocol] });
  }
  return [...groups.values()];
}
