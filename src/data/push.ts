import { createClient, type Session } from '@supabase/supabase-js';
import type { AppData, Day, Protocol, ScheduleRule } from '../core/types';
import { addDays } from '../core/schedule';
import { cloudConfigured, getSession } from './cloud';

const supabaseURL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushConfigured = cloudConfigured && !!vapidPublicKey;

export interface ReminderScheduleInput {
  protocolId: string;
  startDay: Day;
  endDay: Day | null;
  rule: ScheduleRule;
  minuteOfDay: number;
  isActive: boolean;
}

export type PushState = 'checking' | 'unconfigured' | 'unsupported' | 'needs-install' | 'signed-out' | 'denied' | 'available' | 'enabled';

function finitePhaseEnd(protocol: Protocol): Day | null {
  if (!protocol.phases.length || protocol.phases.some(phase => phase.durationDays === null)) return null;
  const duration = protocol.phases.reduce((sum, phase) => sum + (phase.durationDays ?? 0), 0);
  return duration > 0 ? addDays(protocol.startDay, duration - 1) : protocol.startDay;
}

/** The server receives timing only: never peptide names, doses, notes or container data. */
export function reminderSchedules(protocols: Protocol[]): ReminderScheduleInput[] {
  return protocols.map(protocol => {
    const phaseEnd = finitePhaseEnd(protocol);
    const endDay = protocol.endDay && phaseEnd ? (protocol.endDay < phaseEnd ? protocol.endDay : phaseEnd) : protocol.endDay ?? phaseEnd;
    return {
      protocolId: protocol.id,
      startDay: protocol.startDay,
      endDay,
      rule: protocol.rule,
      minuteOfDay: protocol.reminderMinuteOfDay,
      isActive: protocol.isActive,
    };
  });
}

export function currentTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone || 'UTC';
  } catch { return 'UTC'; }
}

export function decodeVapidPublicKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function appleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function standalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function supported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const baseURL = new URL(import.meta.env.BASE_URL, document.baseURI);
  const existing = await navigator.serviceWorker.getRegistration(baseURL.href);
  if (existing) return existing;
  if (!import.meta.env.PROD) throw new Error('Push reminders can be enabled in the installed production app.');
  return navigator.serviceWorker.register(new URL('sw.js', baseURL), { scope: baseURL.pathname });
}

async function accountClient(expectedUserId: string) {
  if (!supabaseURL || !supabaseKey) throw new Error('Supabase is not configured.');
  const session = await getSession();
  if (!session || session.user.id !== expectedUserId) throw new Error('Sign in again before changing push reminders.');
  const client = createClient(supabaseURL, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  return client;
}

async function registerSubscription(userId: string, subscription: PushSubscription, language: 'nb' | 'en'): Promise<void> {
  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) throw new Error('The browser returned an incomplete push subscription.');
  const client = await accountClient(userId);
  const { error } = await client.rpc('register_dailypep_push', {
    p_endpoint: serialized.endpoint,
    p_p256dh: serialized.keys.p256dh,
    p_auth: serialized.keys.auth,
    p_time_zone: currentTimeZone(),
    p_locale: language,
  });
  if (error) throw error;
}

async function syncSchedules(data: AppData, userId: string): Promise<void> {
  const client = await accountClient(userId);
  const { error } = await client.rpc('sync_dailypep_reminders', {
    p_schedules: reminderSchedules(data.protocols),
    p_time_zone: currentTimeZone(),
  });
  if (error) throw error;
}

export async function inspectPushState(session: Session | null): Promise<PushState> {
  if (!pushConfigured) return 'unconfigured';
  if (appleMobile() && !standalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (!session) return 'signed-out';
  if (Notification.permission === 'denied') return 'denied';
  const worker = await registration();
  return await worker.pushManager.getSubscription() ? 'enabled' : 'available';
}

export async function enablePushReminders(data: AppData, userId: string): Promise<void> {
  if (!pushConfigured || !vapidPublicKey) throw new Error('Push reminders are not configured.');
  if (appleMobile() && !standalone()) throw new Error('Add DailyPep to the Home Screen before enabling reminders on iPhone or iPad.');
  if (!supported()) throw new Error('This browser does not support Web Push.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription() ?? await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidPublicKey(vapidPublicKey),
  });
  try {
    await registerSubscription(userId, subscription, data.settings.language);
    await syncSchedules(data, userId);
  } catch (error) {
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }
}

export async function disablePushReminders(userId: string): Promise<void> {
  if (!supported()) return;
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  if (!subscription) return;
  const client = await accountClient(userId);
  const { error } = await client.rpc('unregister_dailypep_push', { p_endpoint: subscription.endpoint });
  if (error) throw error;
  await subscription.unsubscribe();
}

/** Signing out must not leave this browser subscribed to the previous account. */
export async function disconnectPushOnSignOut(userId: string): Promise<void> {
  if (!supported()) return;
  let subscription: PushSubscription | null = null;
  try {
    const worker = await registration();
    subscription = await worker.pushManager.getSubscription();
    if (!subscription) return;
    const client = await accountClient(userId);
    const { error } = await client.rpc('unregister_dailypep_push', { p_endpoint: subscription.endpoint });
    if (error) console.warn('DailyPep server push cleanup failed during sign-out:', error);
  } catch (error) {
    console.warn('DailyPep push cleanup failed during sign-out:', error);
  } finally {
    await subscription?.unsubscribe().catch(() => false);
  }
}

export async function syncExistingPushReminders(data: AppData, userId: string): Promise<boolean> {
  if (!pushConfigured || !supported() || Notification.permission !== 'granted') return false;
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  if (!subscription) return false;
  await registerSubscription(userId, subscription, data.settings.language);
  await syncSchedules(data, userId);
  return true;
}

export async function sendTestPush(userId: string, language: 'nb' | 'en'): Promise<number> {
  const client = await accountClient(userId);
  const { data, error } = await client.functions.invoke('test-push', { body: { language } });
  if (error) throw error;
  if (!data || !Number.isSafeInteger(data.sent)) throw new Error('The test notification was not confirmed.');
  return data.sent;
}
