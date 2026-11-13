import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BellOff, BellRing, Send } from 'lucide-react';
import type { AppData } from '../core/types';
import {
  currentTimeZone,
  disablePushReminders,
  enablePushReminders,
  inspectPushState,
  sendTestPush,
  type PushState,
} from '../data/push';

export function PushSettings({ data, session }: { data: AppData; session: Session | null }) {
  const t = (nb: string, en: string) => data.settings.language === 'nb' ? nb : en;
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setState(await inspectPushState(session)); }
    catch (reason) { setState('unsupported'); setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [session]);
  useEffect(() => { void refresh(); }, [refresh]);
  const action = async (work: () => Promise<void>) => {
    setBusy(true); setMessage(''); setError('');
    try { await work(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  const description = state === 'checking' ? t('Kontrollerer støtte…', 'Checking support…')
    : state === 'unconfigured' ? t('Varselserveren er ikke ferdig konfigurert.', 'The notification server is not configured yet.')
    : state === 'needs-install' ? t('På iPhone og iPad må DailyPep først legges til på Hjem-skjermen. Åpne deretter appen fra ikonet og aktiver varsler her.', 'On iPhone and iPad, add DailyPep to the Home Screen first. Then open it from the icon and enable reminders here.')
    : state === 'unsupported' ? t('Denne nettleseren eller visningsmodusen støtter ikke Web Push.', 'This browser or display mode does not support Web Push.')
    : state === 'signed-out' ? t('Logg inn for å knytte varsler trygt til enheten din. Planene dine lastes ikke opp før du aktiverer varsler.', 'Sign in to link reminders securely to this device. Your schedules are not uploaded until you enable reminders.')
    : state === 'denied' ? t('Varsler er blokkert. Tillat DailyPep i nettleserens eller enhetens varselinnstillinger.', 'Notifications are blocked. Allow DailyPep in your browser or device notification settings.')
    : state === 'enabled' ? t(`Varsler er aktive på denne enheten og følger tidssonen ${currentTimeZone()}.`, `Reminders are active on this device and follow the ${currentTimeZone()} time zone.`)
    : t('Få en diskret påminnelse ved tidspunktet i aktive planer. Låseskjermen viser ikke peptidnavn eller dose.', 'Get a discreet reminder at the time in each active plan. The lock screen does not show peptide names or doses.');

  return <div className="settings-section push-settings">
    <h3><BellRing size={18}/>{t('Pushpåminnelser', 'Push reminders')}</h3>
    <p>{description}</p>
    {state === 'available' && session && <button className="primary" disabled={busy} onClick={() => void action(async () => {
      await enablePushReminders(data, session.user.id);
      setMessage(t('Påminnelser er aktivert.', 'Reminders are enabled.'));
    })}><BellRing size={16}/>{t('Aktiver påminnelser', 'Enable reminders')}</button>}
    {state === 'enabled' && session && <div className="button-row">
      <button disabled={busy} onClick={() => void action(async () => {
        const count = await sendTestPush(session.user.id, data.settings.language);
        setMessage(t(`Testvarsel sendt til ${count} enhet${count === 1 ? '' : 'er'}.`, `Test notification sent to ${count} device${count === 1 ? '' : 's'}.`));
      })}><Send size={16}/>{t('Send testvarsel', 'Send test notification')}</button>
      <button className="secondary" disabled={busy} onClick={() => void action(async () => {
        await disablePushReminders(session.user.id);
        setMessage(t('Påminnelser er deaktivert på denne enheten.', 'Reminders are disabled on this device.'));
      })}><BellOff size={16}/>{t('Deaktiver på denne enheten', 'Disable on this device')}</button>
    </div>}
    {busy && <small role="status">{t('Oppdaterer påminnelser…', 'Updating reminders…')}</small>}
    {message && <p className="success-banner" role="status">{message}</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
  </div>;
}
