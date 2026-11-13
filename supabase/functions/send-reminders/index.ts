import { withSupabase } from '@supabase/server';
import { deliverPush, pushStatus, type StoredPushSubscription } from '../_shared/webPush.ts';

interface ClaimedReminder {
  schedule_id: string;
  user_id: string;
  protocol_id: string;
  occurrence: string;
}

export default {
  fetch: withSupabase({ auth: 'secret:automations' }, async (_req, ctx) => {
    const { data, error } = await ctx.supabaseAdmin.rpc('claim_due_dailypep_reminders', { p_limit: 100 });
    if (error) return Response.json({ error: 'claim_failed' }, { status: 500 });
    const reminders = (data ?? []) as ClaimedReminder[];
    let sent = 0;
    let retried = 0;
    let removed = 0;

    for (const reminder of reminders) {
      const { data: subscriptionData, error: subscriptionError } = await ctx.supabaseAdmin
        .from('dailypep_push_subscriptions')
        .select('id,user_id,endpoint,p256dh,auth,locale')
        .eq('user_id', reminder.user_id)
        .eq('enabled', true);
      if (subscriptionError) {
        await ctx.supabaseAdmin.rpc('release_dailypep_reminder', {
          p_schedule_id: reminder.schedule_id,
          p_occurrence: reminder.occurrence,
          p_error: 'subscription_lookup_failed',
        });
        retried++;
        continue;
      }

      const subscriptions = (subscriptionData ?? []) as StoredPushSubscription[];
      let delivered = 0;
      let transientFailure = false;
      for (const subscription of subscriptions) {
        try {
          await deliverPush(subscription, reminder.occurrence);
          delivered++;
          sent++;
        } catch (deliveryError) {
          const status = pushStatus(deliveryError);
          if (status === 404 || status === 410) {
            await ctx.supabaseAdmin.from('dailypep_push_subscriptions').delete().eq('id', subscription.id);
            removed++;
          } else {
            transientFailure = true;
            console.error('Scheduled push delivery failed', { status, scheduleId: reminder.schedule_id });
          }
        }
      }

      if (delivered > 0) {
        await ctx.supabaseAdmin.rpc('advance_dailypep_reminder', {
          p_schedule_id: reminder.schedule_id,
          p_occurrence: reminder.occurrence,
        });
        continue;
      }

      const { count } = await ctx.supabaseAdmin
        .from('dailypep_push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', reminder.user_id)
        .eq('enabled', true);
      if ((count ?? 0) === 0) {
        await ctx.supabaseAdmin.from('dailypep_reminder_schedules').delete().eq('user_id', reminder.user_id);
      } else {
        await ctx.supabaseAdmin.rpc('release_dailypep_reminder', {
          p_schedule_id: reminder.schedule_id,
          p_occurrence: reminder.occurrence,
          p_error: transientFailure ? 'delivery_failed' : 'no_delivery',
        });
        retried++;
      }
    }

    return Response.json({ claimed: reminders.length, sent, retried, removed });
  }),
};
