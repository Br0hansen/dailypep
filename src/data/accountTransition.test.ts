import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { emptyData } from './validation';
import { copyLocalToEmptyAccount, summarizeRecords } from './accountTransition';
import { localScope, readLocal, updateLocal } from './local';

describe('account transition summaries', () => {
  it('counts every user-owned collection shown in the transition', () => {
    const data = emptyData();
    data.peptides.push({ id: 'p', name: 'Recorded peptide', color: '#fff', notes: '' });
    data.protocols.push({ id: 'pr', peptideId: 'p', name: 'Plan', startDay: '2026-11-12', endDay: null, rule: { kind: 'interval', days: 1 }, phases: [{ id: 'phase', durationDays: null, amount: 1, unit: 'mg' }], reminderMinuteOfDay: 480, isActive: true });
    data.vials.push({ id: 'v', peptideId: 'p', kind: 'powder', amount: 5, unit: 'mg', volumeML: 2, preparedAt: null, expiresAt: null });
    data.logs.push({ id: 'l', protocolId: 'pr', day: '2026-11-12', amount: 1, unit: 'mg', status: 'taken', timestamp: '2026-11-12T08:00:00.000Z', note: '' });
    data.measurements.push({ id: 'm', day: '2026-11-12', name: 'Own value', value: 1, unit: 'x', note: '', category: 'other' });
    data.cycles.push({ id: 'c', name: 'Template', items: [], lastStartedAt: null });
    expect(summarizeRecords(data)).toEqual({ peptides: 1, plans: 1, containers: 1, logs: 1, measurements: 1, templates: 1, total: 6 });
  });

  it('reports a new workspace as empty', () => {
    expect(summarizeRecords(emptyData()).total).toBe(0);
  });

  it('copies into an empty account but never overwrites account records', async () => {
    const userId = 'transition-copy-user';
    const localData = emptyData();
    localData.peptides.push({ id: 'local-p', name: 'Local record', color: '#fff', notes: '' });
    const local = summarizeRecords(localData);
    const accountData = emptyData();
    const transition = { userId, localData, accountData, local, account: summarizeRecords(accountData), canCopyLocal: true };
    await copyLocalToEmptyAccount(transition);
    expect((await readLocal(localScope(userId))).peptides[0].name).toBe('Local record');

    await updateLocal(localScope(userId), data => ({ ...data, peptides: [...data.peptides, { id: 'account-p', name: 'Account record', color: '#fff', notes: '' }] }));
    await expect(copyLocalToEmptyAccount(transition)).rejects.toThrow('no longer empty');
    expect((await readLocal(localScope(userId))).peptides.map(item => item.name)).toEqual(['Local record', 'Account record']);
  });
});
