import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, Syringe } from 'lucide-react';
import type { DoseUnit, ScheduleRule } from '../core/types';
import { searchCatalog } from '../core/catalog';
import { calculateDose, convertDose } from '../core/math';
import { blendDraw, blendVialContent, latestVial, quickSetup } from '../core/quickSetup';
import { blendDrafts, buildBlendComponents, type ComponentDraft } from './planBlend';
import { todayDay } from '../core/schedule';
import { Field, Modal, RuleFields, SuggestInput, colors, numberText, positive, uid, unitLabel, type ViewProps } from './shared';

type Frequency = 'daily' | 'other' | 'weekly' | 'custom';
const normalize = (value: string) => value.trim().toLocaleLowerCase();

/** One screen: peptide, vial content (per component for blends), BAC water and amount → units to draw, then start. */
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
  const [components, setComponents] = useState<ComponentDraft[]>([]);
  const [steer, setSteer] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isBlend = components.length > 0;
  const a = positive(vialAmount), w = positive(water), d = positive(dose);
  let blend: ReturnType<typeof buildBlendComponents> | null = null;
  try { blend = isBlend ? buildBlendComponents(components) : null; } catch { blend = null; }
  const blendResult = blend && w !== null && d !== null ? blendDraw(blend, w, steer, d, doseUnit) : null;
  const converted = d === null ? null : convertDose(d, doseUnit, vialUnit);
  const result = isBlend ? blendResult : a !== null && w !== null && converted !== null ? calculateDose(a, w, converted) : null;
  const tooMuch = isBlend ? Boolean(blendResult?.tooMuch) : a !== null && converted !== null && converted > a + 1e-9;
  const steerUnit = components[steer]?.unit;
  const rule: ScheduleRule = frequency === 'daily' ? { kind: 'interval', days: 1 } : frequency === 'other' ? { kind: 'interval', days: 2 } : frequency === 'weekly' ? { kind: 'interval', days: 7 } : customRule;
  const ruleOk = rule.kind === 'interval' ? Number.isSafeInteger(rule.days) && rule.days >= 1 && rule.days <= 3650
    : rule.kind === 'weekdays' ? rule.days.length > 0
    : Number.isSafeInteger(rule.daysOn) && rule.daysOn >= 1 && Number.isSafeInteger(rule.daysOff) && rule.daysOff >= 0;

  function chooseName(value: string) {
    setName(value);
    // Blends from the catalog get one row per component; recorded amounts are filled in and locked.
    const peptide = data.peptides.find(p => normalize(p.name) === normalize(value));
    const drafts = blendDrafts(value, peptide?.components);
    setComponents(drafts); setSteer(0);
    if (drafts.length) setDoseUnit(drafts[0].unit === 'iu' ? 'iu' : doseUnit === 'iu' ? 'mcg' : doseUnit);
    // Reuse the numbers from the container already recorded for this peptide.
    const vial = latestVial(data, value);
    if (vial && vial.kind === 'powder' && drafts.length && !water) setWater(String(vial.volumeML));
    else if (vial && vial.kind === 'powder' && !vialAmount && !water) {
      setVialAmount(String(vial.amount)); setVialUnit(vial.unit); setWater(String(vial.volumeML));
      setDoseUnit(vial.unit === 'iu' ? 'iu' : vial.unit === 'mcg' ? 'mcg' : doseUnit);
    }
  }
  function chooseSteer(index: number) {
    setSteer(index);
    const unit = components[index]?.unit;
    setDoseUnit(unit === 'iu' ? 'iu' : doseUnit === 'iu' ? 'mcg' : doseUnit);
  }
  const patchComponent = (index: number, value: Partial<ComponentDraft>) => {
    setComponents(current => current.map((c, i) => i === index ? { ...c, ...value } : c));
    if (index === steer && value.unit) setDoseUnit(value.unit === 'iu' ? 'iu' : doseUnit === 'iu' ? 'mcg' : doseUnit);
  };
  function chooseVialUnit(unit: DoseUnit) {
    setVialUnit(unit);
    setDoseUnit(unit === 'iu' ? 'iu' : doseUnit === 'iu' ? 'mcg' : doseUnit);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError(t('Skriv inn navnet på peptidet.', 'Enter the peptide name.'));
    if (isBlend ? !blend || w === null || d === null : a === null || w === null || d === null) return setError(isBlend
      ? t('Fyll inn innholdet for hver komponent, ml vann og mengden din.', 'Fill in each component, the water and your amount.')
      : t('Fyll inn mg i glasset, ml vann og mengden din.', 'Fill in the vial content, the water and your amount.'));
    if (!result) return setError(t('Kan ikke regne om mellom disse enhetene.', 'These units cannot be converted.'));
    if (tooMuch) return setError(t('Mengden er større enn det glasset inneholder.', 'The amount is more than the vial contains.'));
    if (!ruleOk) return setError(t('Kontroller hvor ofte.', 'Check how often.'));
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return setError(t('Kontroller tidspunktet.', 'Check the time.'));
    const [hour, minute] = time.split(':').map(Number);
    setBusy(true); setError('');
    try {
      // Blends are dosed in units (U-100): a volume, so every component follows from the same draw.
      const content = blend ? blendVialContent(blend) : { amount: a!, unit: vialUnit };
      await update(current => quickSetup(current, {
        name, color: colors[current.peptides.length % colors.length], vialAmount: content.amount, vialUnit: content.unit, waterML: w!,
        doseAmount: blend ? Math.round(result.units * 1e6) / 1e6 : d!, doseUnit: blend ? 'units' : doseUnit,
        rule, minuteOfDay: hour * 60 + minute, startDay: todayDay(), ...(blend ? { components: blend } : {}),
      }, { peptide: uid(), vial: uid(), protocol: uid(), plan: uid() }));
      onSaved(t(`${name.trim()} er startet. Du finner den under I dag.`, `${name.trim()} has started. You'll find it in Today.`));
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  const units = result ? numberText(Math.round(result.units * 100) / 100, language) : null;
  const chips: [Frequency, string][] = [['daily', t('Daglig', 'Daily')], ['other', t('Annenhver dag', 'Every other day')], ['weekly', t('1× i uka', 'Weekly')], ['custom', t('Annet', 'Other')]];

  return <Modal title={t('Legg til plan', 'Add plan')} onClose={() => !busy && onClose()}>
    <form className="stack quick-setup" onSubmit={submit}>
      <Field label={t('Peptid', 'Peptide')}><SuggestInput required autoFocus value={name} onChange={chooseName} options={[...data.peptides.map(p => p.name), ...searchCatalog('').map(p => p.name)]} placeholder={t('Søk eller skriv navn', 'Search or type a name')}/></Field>
      {isBlend ? <><div className="blend-quick stack"><span className="field-label">{t('Innhold i glasset, fra etiketten', 'Vial content, from the label')}</span>{components.map((c, index) => <Field key={c.name} label={c.name}><div className="input-with-unit"><input required readOnly={c.locked} inputMode="decimal" type="number" min="0.000001" step="any" value={c.amount} onChange={e => patchComponent(index, { amount: e.target.value })} placeholder="5"/><select aria-label={`${t('Enhet for', 'Unit for')} ${c.name}`} disabled={c.locked} value={c.unit} onChange={e => patchComponent(index, { unit: e.target.value as ComponentDraft['unit'] })}>{(['mg', 'mcg', 'iu'] as const).map(u => <option key={u} value={u}>{unitLabel(u, language)}</option>)}</select></div></Field>)}{components.some(c => c.locked) && <small className="muted">{t('Hentet fra peptidet ditt. Endres under Beholdning.', 'From your peptide. Change it in Inventory.')}</small>}</div>
        <Field label={t('BAC-vann (ml)', 'BAC water (ml)')}><input required inputMode="decimal" type="number" min="0.000001" step="any" value={water} onChange={e => setWater(e.target.value)} placeholder="2"/></Field></>
      : <div className="form-grid">
        <Field label={t('Innhold i glasset', 'Vial content')}><div className="input-with-unit"><input required inputMode="decimal" type="number" min="0.000001" step="any" value={vialAmount} onChange={e => setVialAmount(e.target.value)} placeholder="5"/><select aria-label={t('Enhet for glasset', 'Vial unit')} value={vialUnit} onChange={e => chooseVialUnit(e.target.value as DoseUnit)}>{(['mg', 'mcg', 'iu'] as DoseUnit[]).map(u => <option key={u} value={u}>{unitLabel(u, language)}</option>)}</select></div></Field>
        <Field label={t('BAC-vann (ml)', 'BAC water (ml)')}><input required inputMode="decimal" type="number" min="0.000001" step="any" value={water} onChange={e => setWater(e.target.value)} placeholder="2"/></Field>
      </div>}
      <Field label={isBlend && components.length > 1 ? t('Din mengde per dose, av én komponent', 'Your amount per dose, of one component') : t('Din mengde per dose', 'Your amount per dose')}><div className="input-with-unit"><input required inputMode="decimal" type="number" min="0.000001" step="any" value={dose} onChange={e => setDose(e.target.value)} placeholder="250"/><select aria-label={t('Enhet for mengden', 'Amount unit')} value={doseUnit} onChange={e => setDoseUnit(e.target.value as DoseUnit)}>{((isBlend ? steerUnit : vialUnit) === 'iu' ? ['iu'] as DoseUnit[] : ['mcg', 'mg'] as DoseUnit[]).map(u => <option key={u} value={u}>{unitLabel(u, language)}</option>)}</select></div></Field>
      {isBlend && components.length > 1 && <Field label={t('Mengden gjelder', 'The amount is for')}><select value={steer} onChange={e => chooseSteer(Number(e.target.value))}>{components.map((c, index) => <option key={c.name} value={index}>{c.name}</option>)}</select></Field>}
      <div className={`draw-result ${result && !tooMuch ? 'ready' : ''}`} role="status" aria-live="polite">
        <Syringe size={20}/>
        {result && !tooMuch ? <div><strong>{t('Trekk opp', 'Draw')} {units} {t('E', 'units')}</strong><span>{numberText(Math.round(result.volumeML * 1000) / 1000, language)} ml · {result.doses} {t('doser i glasset', 'doses per vial')} · U-100</span>{blendResult && blendResult.perDose.length > 1 && <span className="draw-components">= {blendResult.perDose.map(c => { const shown = convertDose(c.amount, c.unit, doseUnit); return `${numberText(Math.round((shown ?? c.amount) * 100) / 100, language)} ${unitLabel(shown === null ? c.unit : doseUnit, language)} ${c.name}`; }).join(' + ')}</span>}</div>
          : <div><strong>{tooMuch ? t('Mer enn glasset inneholder', 'More than the vial contains') : t('Enheter å trekke opp', 'Units to draw')}</strong><span>{tooMuch ? t('Kontroller tallene.', 'Check your numbers.') : (isBlend && !blend && d !== null && w !== null ? t('Fyll inn innholdet for hver komponent.', 'Fill in the content of each component.') : t('Vises når glass, vann og mengde er fylt inn. 1 ml = 100 E.', 'Shown once vial, water and amount are filled in. 1 ml = 100 units.'))}</span></div>}
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
