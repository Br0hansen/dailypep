import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyData } from './validation';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), signInWithOtp: vi.fn(), getSession: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mocks.rpc, auth: { signInWithOtp: mocks.signInWithOtp, getSession: mocks.getSession } }) }));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
  mocks.rpc.mockReset();
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'alice' }, access_token: 'alice-token' } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('revision-checked cloud backup', () => {
  it('passes an explicit expected revision to the atomic server function', async () => {
    mocks.rpc.mockResolvedValue({ data: 4, error: null });
    const { saveCloudBackup } = await import('./cloud');
    expect(await saveCloudBackup(emptyData(), 3)).toBe(4);
    expect(mocks.rpc).toHaveBeenCalledWith('save_dailypep_backup', { p_payload: emptyData(), p_expected_revision: 3 });
  });
  it('surfaces a conflict instead of silently overwriting or retrying', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'BACKUP_CONFLICT' } });
    const { saveCloudBackup, CloudConflictError } = await import('./cloud');
    await expect(saveCloudBackup(emptyData(), 3)).rejects.toBeInstanceOf(CloudConflictError);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('refuses invalid data or invalid revisions before requesting a write', async () => {
    const { saveCloudBackup } = await import('./cloud');
    await expect(saveCloudBackup(emptyData(), -1)).rejects.toThrow('revision');
    await expect(saveCloudBackup({ ...emptyData(), version: 2 } as never, 0)).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires a confirmed new revision from the server', async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null });
    const { saveCloudBackup } = await import('./cloud');
    await expect(saveCloudBackup(emptyData(), 3)).rejects.toThrow('not confirmed');
  });
  it('rejects a click carrying data for an account that is no longer active', async () => {
    const { saveCloudBackup } = await import('./cloud');
    await expect(saveCloudBackup(emptyData(), 0, 'bob')).rejects.toThrow('account changed');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
