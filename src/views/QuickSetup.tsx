import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, Syringe } from 'lucide-react';
import type { DoseUnit, ScheduleRule } from '../core/types';
import { catalog, searchCatalog } from '../core/catalog';
import { calculateDose, convertDose } from '../core/math';
import { latestVial, quickSetup } from '../core/quickSetup';
import { todayDay } from '../core/schedule';
import { Field, Modal, RuleFields, colors, numberText, positive, uid, unitLabel, type ViewProps } from './shared';

type Frequency = 'daily' | 'other' | 'weekly' | 'custom';
const normalize = (value: string) => value.trim().toLocaleLowerCase();

/** One screen: peptide, vial content, BAC water and amount → units to draw, then start. */
export function QuickSetup({ data, update, language, onClose, onSaved, onFullWizard }: ViewProps & { onClose: () => void; onSaved: (message: string) => void; onFullWizard: () => void }) {
  const t = (nb: string, en: string) => language === 'nb' ? nb : en;
  const [name, setName] = useState('');
  const [vialAmount, setVialAmount] = useState('');
  const [vialUnit, setVialUnit] = useState<DoseUnit>('mg');
  const [water, setWater] = useState('');
  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<DoseUnit>('mcg');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [customRule, setCustomRule] = useState<ScheduleRule>({ kind: 'interval', days: 1 });
  const [time, setTime] = useState('08:00');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const existing = data.peptides.find(p => normalize(p.name) === normalize(name));
  const isBlend = Boolean(existing?.components?.length || catalog.find(c => normalize(c.name) === normalize(name))?.componentNames.length);
  const a = positive(vialAmount), w = positive(water), d = positive(dose);
  const converted = d === null ? null : convertDose(d, doseUnit, vialUnit);
  const result = a !== null && w !== null && converted !== null ? calculateDose(a, w, converted) : null;
  const tooMuch = a !== null && converted !== null && converted > a + 1e-9;
  const rule: ScheduleRule = frequency === 'daily' ? { kind: 'interval', days: 1 } : frequency === 'other' ? { kind: 'interval', days: 2 } : frequency === 'weekly' ? { kind: 'interval', days: 7 } : customRule;
  const ruleOk = rule.kind === 'interval' ? Number.isSafeInteger(rule.days) && rule.days >= 1 && rule.days <= 3650
    : rule.kind === 'weekdays' ? rule.days.length > 0
    : Number.isSafeInteger(rule.daysOn) && rule.daysOn >= 1 && Number.isSafeInteger(rule.daysOff) && rule.daysOff >= 0;

  function chooseName(value: string) {
    setName(value);
    // Reuse the numbers from the container already recorded for this peptide.
    const vial = latestVial(data, value);
    if (vial && vial.kind === 'powder' && !vialAmount && !water) {
      setVialAmount(String(vial.amount)); setVialUnit(vial.unit); setWater(String(vial.volumeML));
      setDoseUnit(vial.unit === 'iu' ? 'iu' : vial.unit === 'mcg' ? 'mcg' : doseUnit);
    }
  }
  function chooseVialUnit(unit: DoseUnit) {
    setVialUnit(unit);
    setDoseUnit(unit === 'iu' ? 'iu' : doseUnit === 'iu' ? 'mcg' : doseUnit);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError(t('Skriv inn navnet på peptidet.', 'Enter the peptide name.'));
    if (isBlend) return setError(t('Blends settes opp i full veiviser.', 'Blends are set up in the full wizard.'));
    if (a === null || w === null || d === null) return setError(t('Fyll inn mg i glasset, ml vann og mengden din.', 'Fill in the vial content, the water and your amount.'));
    if (!result) return setError(t('Kan ikke regne om mellom disse enhetene.', 'These units cannot be converted.'));
    if (tooMuch) return setError(t('Mengden er større enn det glasset inneholder.', 'The amount is more than the vial contains.'));
    if (!ruleOk) return setError(t('Kontroller hvor ofte.', 'Check how often.'));
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return setError(t('Kontroller tidspunktet.', 'Check the time.'));
    const [hour, minute] = time.split(':').map(Number);
    setBusy(true); setError('');
    try {
      await update(current => quickSetup(current, {
        name, color: colors[current.peptides.length % colors.length], vialAmount: a, vialUnit, waterML: w,
        doseAmount: d, doseUnit, rule, minuteOfDay: hour * 60 + minute, startDay: todayDay(),
      }, { peptide: uid(), vial: uid(), protocol: uid(), plan: uid() }));
      onSaved(t(`${name.trim()} er startet. Du finner den under I dag.`, `${name.trim()} has started. You'll find it in Today.`));
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  const units = result ? numberText(Math.round(result.units * 100) / 100, language) : null;
  const chips: [Frequency, string][] = [['daily', t('Daglig', 'Daily')], ['other', t('Annenhver dag', 'Every other day')], ['weekly', t('1× i uka', 'Weekly')], ['custom', t('Annet', 'Other')]];

  return <Modal title={t('Legg til plan', 'Add plan')} onClose={() => !busy && onClose()}>
    <form className="stack quick-setup" onSubmit={submit}>
      <Field label={t('Peptid', 'Peptide')}><input required autoFocus list="quick-peptides" maxLength={120} value={name} onChange={e => chooseName(e.target.value)} placeholder={t('Søk eller skriv navn', 'Search or type a name')}/></Field>
      <datalist id="quick-peptides">{[...new Set([...data.peptides.map(p => p.name), ...searchCatalog('').map(p => p.name)])].map(value => <option key={value} value={value}/>)}</datalist>
      {isBlend && <p className="info-note">{t('Dette er en blend. Den settes opp med innhold per komponent i full veiviser.', 'This is a blend. It is set up with content per component in the full wizard.')} <button type="button" className="text-button" onClick={onFullWizard}>{t('Åpne full veiviser', 'Open full wizard')}</button></p>}
      <div className="form-grid">
        <Field label={t('Innhold i glasset', 'Vial content')}><div className="input-with-unit"><input required inputMode="decimal" type="number" min="0.000001" step="any" value={vialAmount} onChange={e => setVialAmount(e.target.value)} placeholder="5"/><select aria-label={t('Enhet for glasset', 'Vial unit')} value={vialUnit} onChange={e => chooseVialUnit(e.target.value as DoseUnit)}>{(['mg', 'mcg', 'iu'] as DoseUnit[]).map(u => <option key={u} value={u}>{unitLabel(u, language)}</option>)}</select></div></Field>
        <Field label={t('BAC-vann (ml)', 'BAC water (ml)')}><input required inputMode="decimal" type="number" min="0.000001" step="any" value={water} onChange={e => setWater(e.target.value)} placeholder="2"/></Field>
      </div>
      <Field label={t('Din mengde per dose', 'Your amount per dose')}><div className="input-with-unit"><input required inputMode="decimal" type="number" min="0.000001" step="any" value={dose} onChange={e => setDose(e.target.value)} placeholder="250"/><select aria-label={t('Enhet for mengden', 'Amount unit')} value={doseUnit} onChange={e => setDoseUnit(e.target.value as DoseUnit)}>{(vialUnit === 'iu' ? ['iu'] as DoseUnit[] : ['mcg', 'mg'] as DoseUnit[]).map(u => <option key={u} value={u}>{unitLabel(u, language)}</option>)}</select></div></Field>
      <div className={`draw-result ${result && !tooMuch ? 'ready' : ''}`} role="status" aria-live="polite">
        <Syringe size={20}/>
        {result && !tooMuch ? <div><strong>{t('Trekk opp', 'Draw')} {units} {t('E', 'units')}</strong><span>{numberText(Math.round(result.volumeML * 1000) / 1000, language)} ml · {result.doses} {t('doser i glasset', 'doses per vial')} · U-100</span></div>
          : <div><strong>{tooMuch ? t('Mer enn glasset inneholder', 'More than the vial contains') : t('Enheter å trekke opp', 'Units to draw')}</strong><span>{tooMuch ? t('Kontroller tallene.', 'Check your numbers.') : t('Vises når glass, vann og mengde er fylt inn. 1 ml = 100 E.', 'Shown once vial, water and amount are filled in. 1 ml = 100 units.')}</span></div>}
      </div>
      <fieldset className="frequency-chips"><legend>{t('Hvor ofte', 'How often')}</legend><div>{chips.map(([value, label]) => <button type="button" key={value} className={frequency === value ? 'active' : ''} aria-pressed={frequency === value} onClick={() => setFrequency(value)}>{label}</button>)}</div></fieldset>
      {frequency === 'custom' && <RuleFields value={customRule} onChange={setCustomRule} language={language}/>}
      <Field label={t('Tidspunkt', 'Time')}><input required type="time" value={time} onChange={e => setTime(e.target.value)}/></Field>
      <small className="muted">{t('Starter i dag. Planen kobles til dette glasset, så restinnholdet følges automatisk.', 'Starts today. The plan is linked to this vial, so the remaining content is tracked.')}</small>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="wizard-actions"><button type="button" className="text-button" disabled={busy} onClick={onFullWizard}>{t('Flere peptider, faser eller sluttdato', 'Several peptides, phases or end date')}<ArrowRight size={14}/></button><button type="submit" className="button primary" disabled={busy}><Check size={16}/>{busy ? t('Lagrer…', 'Saving…') : t('Start', 'Start')}</button></div>
    </form>
  </Modal>;
}
