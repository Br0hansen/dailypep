import { createClient, type Session } from '@supabase/supabase-js';
import type { AppData } from '../core/types';
import { validateData } from './validation';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudConfigured = !!url && !!key;
const client = cloudConfigured ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
function requireClient() { if (!client) throw new Error('Supabase has not been configured. Local saving is still available.'); return client; }

export async function signIn(email: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${location.origin}${location.pathname}` } });
  if (error) throw error;
}
export async function signOut(): Promise<void> {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
}
export async function getSession(): Promise<Session | null> {
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}
export function onAuthChange(callback: (session: Session | null) => void): () => void {
  if (!client) return () => undefined;
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
export interface CloudBackup { userId: string; data: AppData; revision: number; updatedAt: string; }
export class CloudConflictError extends Error {
  constructor() { super('A newer cloud backup exists. Fetch it before deciding which copy to keep.'); this.name = 'CloudConflictError'; }
}

async function accountClient(expectedUserId?: string) {
  const session = await getSession();
  if (!session) throw new Error('Sign in before using cloud backups.');
  if (expectedUserId && session.user.id !== expectedUserId) throw new Error('The active account changed. Please try again.');
  // A token captured at click time keeps a slow request on that account even if
  // another tab signs out or switches accounts before the HTTP request starts.
  const scopedClient = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  return { client: scopedClient, userId: session.user.id };
}

export async function fetchCloudBackup(expectedUserId?: string): Promise<CloudBackup | null> {
  const account = await accountClient(expectedUserId);
  const { data, error } = await account.client.from('dailypep_backups').select('user_id,payload,revision,updated_at').eq('user_id', account.userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (!Number.isSafeInteger(data.revision) || data.revision < 1) throw new Error('Invalid cloud backup revision.');
  return { userId: data.user_id, data: validateData(data.payload), revision: data.revision, updatedAt: data.updated_at };
}

/** expectedRevision=0 creates only; any stale revision fails atomically on the server. */
export async function saveCloudBackup(data: AppData, expectedRevision: number, expectedUserId?: string): Promise<number> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid expected cloud revision.');
  const payload = validateData(data);
  const account = await accountClient(expectedUserId);
  const { data: revision, error } = await account.client.rpc('save_dailypep_backup', { p_payload: payload, p_expected_revision: expectedRevision });
  if (error) {
    if (error.code === 'P0001' && error.message.includes('BACKUP_CONFLICT')) throw new CloudConflictError();
    throw error;
  }
  if (!Number.isSafeInteger(revision) || revision <= expectedRevision) throw new Error('The cloud backup was not confirmed.');
  return revision;
}
