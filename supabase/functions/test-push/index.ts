import { withSupabase } from '@supabase/server';
import { deliverPush, pushStatus, type StoredPushSubscription } from '../_shared/webPush.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const claims = ctx.userClaims as { id?: string; sub?: string } | undefined;
    const userId = claims?.id ?? claims?.sub;
    if (!userId) return Response.json({ error: 'user_not_found' }, { status: 401 });
    let language: 'nb' | 'en' = 'en';
    try {
      const body = await req.json() as { language?: unknown };
      if (body.language === 'nb' || body.language === 'en') language = body.language;
    } catch { /* The default language is safe for an empty body. */ }

    const { data, error } = await ctx.supabaseAdmin
      .from('dailypep_push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth,locale')
      .eq('user_id', userId)
      .eq('enabled', true);
    if (error) return Response.json({ error: 'subscription_lookup_failed' }, { status: 500 });
    const subscriptions = (data ?? []) as StoredPushSubscription[];
    if (!subscriptions.length) return Response.json({ error: 'no_push_subscription' }, { status: 409 });

    let sent = 0;
    for (const subscription of subscriptions) {
      try {
        await deliverPush(subscription, `test-${Date.now()}`, language);
        sent++;
      } catch (deliveryError) {
        const status = pushStatus(deliveryError);
        if (status === 404 || status === 410) {
          await ctx.supabaseAdmin.from('dailypep_push_subscriptions').delete().eq('id', subscription.id).eq('user_id', userId);
        } else {
          console.error('Test push delivery failed', { status });
        }
      }
    }
    return Response.json({ sent }, { status: sent > 0 ? 200 : 502 });
  }),
};
