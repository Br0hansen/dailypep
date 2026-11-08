import { openDB, type DBSchema } from 'idb';
import type { AppData } from '../core/types';
import { emptyData, validateData } from './validation';

interface LocalSchema extends DBSchema { snapshots: { key: string; value: AppData }; }
export const localScope = (userId?: string | null) => userId ? `account:${userId}` : 'local';
const database = () => openDB<LocalSchema>('dailypep', 1, { upgrade(db) { db.createObjectStore('snapshots'); } });
const listeners = new Set<(scope: string) => void>();
let channel: BroadcastChannel | undefined;
function notify(scope: string) { listeners.forEach(listener => listener(scope)); }
function sharedChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  try { channel ??= new BroadcastChannel('dailypep-records'); return channel; }
  catch { return undefined; /* Storage may work even when cross-tab messages are blocked. */ }
}
function broadcast(scope: string) {
  notify(scope);
  try { sharedChannel()?.postMessage(scope); } catch { /* A committed write remains successful. */ }
}
export function subscribeToLocal(listener: (scope: string) => void): () => void {
  listeners.add(listener);
  const activeChannel = sharedChannel();
  if (activeChannel) {
    activeChannel.onmessage = event => { if (typeof event.data === 'string') notify(event.data); };
  }
  return () => { listeners.delete(listener); };
}

export async function readLocal(scope: string): Promise<AppData> {
  const db = await database();
  try { const data = await db.get('snapshots', scope); return data ? validateData(data) : emptyData(); }
  finally { db.close(); }
}

/** Read-modify-write in one transaction prevents lost updates between tabs and queued clicks. */
export async function updateLocal(scope: string, updater: (data: AppData) => AppData): Promise<AppData> {
  const db = await database();
  const tx = db.transaction('snapshots', 'readwrite');
  try {
    const stored = await tx.store.get(scope);
    const data = validateData(updater(stored ? validateData(stored) : emptyData()));
    await tx.store.put(data, scope);
    await tx.done;
    broadcast(scope);
    return data;
  } catch (error) {
    try { tx.abort(); } catch { /* The transaction may already have aborted. */ }
    await tx.done.catch(() => undefined);
    throw error;
  } finally { db.close(); }
}

export async function requestPersistentStorage(): Promise<boolean> {
  return typeof navigator !== 'undefined' && !!navigator.storage?.persist ? navigator.storage.persist() : false;
}
