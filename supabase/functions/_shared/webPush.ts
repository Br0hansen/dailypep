import * as webpush from 'npm:web-push@4.0.0';

export interface StoredPushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: 'nb' | 'en';
}

let configured = false;

function configure(): void {
  if (configured) return;
  const subject = Deno.env.get('VAPID_SUBJECT');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!subject || !publicKey || !privateKey) throw new Error('VAPID secrets are not configured.');
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

async function topicFor(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}

export function pushStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return null;
}

export async function deliverPush(subscription: StoredPushSubscription, occurrence: string, language?: 'nb' | 'en'): Promise<void> {
  configure();
  const payload = JSON.stringify({ language: language ?? subscription.locale, occurrence });
  await webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }, payload, {
    TTL: 6 * 60 * 60,
    urgency: 'normal',
    topic: await topicFor(`${subscription.user_id}:${occurrence}`),
  });
}
