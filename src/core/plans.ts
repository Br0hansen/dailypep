import type { AppData, Protocol } from './types';

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

/** Deletes plan items but keeps their logs: each kept log gets the peptide name so the Journal still reads correctly. */
export function deletePlan(data: AppData, protocolIds: readonly string[]): AppData {
  const ids = new Set(protocolIds);
  const removed = new Map(data.protocols.filter(p => ids.has(p.id)).map(p => [p.id, p]));
  return {
    ...data,
    protocols: data.protocols.filter(p => !ids.has(p.id)),
    logs: data.logs.map(log => {
      const protocol = removed.get(log.protocolId);
      if (!protocol || log.peptideName) return log;
      return { ...log, peptideName: data.peptides.find(p => p.id === protocol.peptideId)?.name ?? protocol.name };
    }),
  };
}
