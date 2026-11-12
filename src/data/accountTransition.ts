import type { AppData } from '../core/types';
import { localScope, readLocal, updateLocal } from './local';

const activeScopeKey = 'dailypep-active-workspace';

export interface RecordSummary {
  peptides: number;
  plans: number;
  containers: number;
  logs: number;
  measurements: number;
  templates: number;
  total: number;
}

export interface AccountTransition {
  userId: string;
  localData: AppData;
  accountData: AppData;
  local: RecordSummary;
  account: RecordSummary;
  canCopyLocal: boolean;
}

export function summarizeRecords(data: AppData): RecordSummary {
  const summary = {
    peptides: data.peptides.length,
    plans: data.protocols.length,
    containers: data.vials.length,
    logs: data.logs.length,
    measurements: data.measurements.length,
    templates: data.cycles.length,
  };
  return { ...summary, total: Object.values(summary).reduce((sum, count) => sum + count, 0) };
}

/** A remembered workspace prevents an auth-token refresh from reopening the choice dialog. */
export function preferredWorkspace(): string {
  try { return localStorage.getItem(activeScopeKey) ?? localScope(); }
  catch { return localScope(); }
}

export function rememberWorkspace(userId?: string | null): void {
  try { localStorage.setItem(activeScopeKey, localScope(userId)); }
  catch { /* The selected workspace still remains active for this page load. */ }
}

export async function inspectAccountTransition(userId: string): Promise<AccountTransition> {
  const [localData, accountData] = await Promise.all([readLocal(localScope()), readLocal(localScope(userId))]);
  const local = summarizeRecords(localData);
  const account = summarizeRecords(accountData);
  return { userId, localData, accountData, local, account, canCopyLocal: local.total > 0 && account.total === 0 };
}

/** Copy is deliberately create-only: existing account records are never overwritten or merged. */
export async function copyLocalToEmptyAccount(transition: AccountTransition): Promise<void> {
  await updateLocal(localScope(transition.userId), current => {
    if (summarizeRecords(current).total > 0) throw new Error('The account workspace is no longer empty. Open it and review the records before deciding what to keep.');
    return transition.localData;
  });
}
