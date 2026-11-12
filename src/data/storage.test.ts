import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { localScope, persistentStorageStatus, readLocal, requestPersistentStorage, updateLocal } from './local';

beforeAll(() => vi.stubGlobal('BroadcastChannel', undefined));
afterAll(() => vi.unstubAllGlobals());

describe('local durable saving', () => {
  it('keeps local and separate accounts isolated', async () => {
    await updateLocal(localScope(), data => ({ ...data, settings: { language: 'nb', theme: 'corall' } }));
    expect((await readLocal(localScope())).settings.theme).toBe('corall');
    expect((await readLocal(localScope('alice'))).settings.theme).toBe('electric');
    await updateLocal(localScope('alice'), data => ({ ...data, settings: { ...data.settings, language: 'nb' } }));
    expect((await readLocal(localScope('bob'))).settings.language).toBe('en');
    expect((await readLocal(localScope('alice'))).settings.language).toBe('nb');
  });
  it('reads the latest data inside every write transaction', async () => {
    const scope = 'test-concurrent';
    await Promise.all(Array.from({ length: 8 }, (_, i) => updateLocal(scope, data => ({ ...data,
      peptides: [...data.peptides, { id: `p${i}`, name: `User record ${i}`, color: '#00ffee', notes: '' }],
    }))));
    expect((await readLocal(scope)).peptides).toHaveLength(8);
  });
  it('retains the previous data when an update is invalid', async () => {
    const scope = 'test-rollback';
    await updateLocal(scope, data => ({ ...data, settings: { ...data.settings, language: 'nb' } }));
    await expect(updateLocal(scope, data => ({ ...data, version: 2 } as never))).rejects.toThrow();
    expect((await readLocal(scope)).settings.language).toBe('nb');
  });

  it('reports and requests durable browser storage without assuming support', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(true) } });
    expect(await persistentStorageStatus()).toBe('not-granted');
    expect(await requestPersistentStorage()).toBe('granted');
  });

  it('degrades safely when the persistence API is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    expect(await persistentStorageStatus()).toBe('unsupported');
    expect(await requestPersistentStorage()).toBe('unsupported');
  });
});
