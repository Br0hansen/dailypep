import { useState } from 'react';
import { Droplets, Info, Layers3, Plus, Syringe, Trash2 } from 'lucide-react';
import { convertDose } from '../core/math';
import { calculateBlendDraw, calculateBlendReconstitution, calculateDraw, calculateReconstitution, drawMarksPerML, type ContentUnit, type DrawScale } from '../core/reconstitution';
import type { BlendComponent } from '../core/types';
import { Field, numberText, positive, unitLabel, type ViewProps } from './shared';

type Mode = 'draw' | 'recon' | 'blend';
type ComponentDraft = { id: string; name: string; amount: string; unit: ContentUnit };
const blankComponent = (): ComponentDraft => ({ id: crypto.randomUUID(), name: '', amount: '', unit: 'mg' });
function ContentUnitSelect({ value, onChange, language }: { value: ContentUnit; onChange: (unit: ContentUnit) => void; language: 'nb' | 'en' }) {
  return <select value={value} onChange={event => onChange(event.target.value as ContentUnit)}>{(['mg', 'mcg', 'iu'] as ContentUnit[]).map(unit => <option key={unit} value={unit}>{unitLabel(unit, language)}</option>)}</select>;
}

export function CalculatorView({ data, language }: ViewProps) {
  const t = (nb: string, en: string) => language === 'nb' ? nb : en;
  const n = (value: number) => numberText(value, language);
  const [mode, setMode] = useState<Mode>('recon');
  const [vialId, setVialId] = useState('');
  const [amount, setAmount] = useState('');
  const [volume, setVolume] = useState('');
  const [dose, setDose] = useState('');
  const [contentUnit, setContentUnit] = useState<ContentUnit>('mg');
  const [doseUnit, setDoseUnit] = useState<ContentUnit>('mg');
  const [markCount, setMarkCount] = useState('');
  const [scaleKind, setScaleKind] = useState<DrawScale['kind']>('u100');
  const [clicksPerML, setClicksPerML] = useState('');
  const [components, setComponents] = useState<ComponentDraft[]>([blankComponent(), blankComponent()]);
  const [blendDirection, setBlendDirection] = useState<'draw' | 'recon'>('draw');
  const [referenceId, setReferenceId] = useState('');
  const scale: DrawScale = scaleKind === 'u100' ? { kind: 'u100' } : { kind: 'clicks', marksPerML: positive(clicksPerML) ?? 0 };
  const marksLabel = scaleKind === 'u100' ? t('U (U-100)', 'U (U-100)') : t('klikk', 'clicks');
  const a = positive(amount), v = positive(volume), d = positive(dose), marks = positive(markCount);
  const converted = d === null ? null : convertDose(d, doseUnit, contentUnit);
  const singleResult = a !== null && d !== null ? mode === 'draw' && v !== null
    ? calculateDraw(a, contentUnit, v, d, doseUnit, scale)
    : mode === 'recon' && marks !== null ? calculateReconstitution(a, contentUnit, d, doseUnit, marks, scale) : null : null;
  const builtComponents: BlendComponent[] = components.flatMap(component => { const quantity = positive(component.amount); return quantity === null || !component.name.trim() ? [] : [{ name: component.name.trim(), amount: quantity, unit: component.unit }]; });
  const componentsValid = builtComponents.length === components.length && components.length >= 2;
  const referenceIndex = components.findIndex(component => component.id === referenceId);
  const reference = referenceIndex >= 0 ? components[referenceIndex] : null;
  const inverse = mode === 'recon' || mode === 'blend' && blendDirection === 'recon';
  const blendResult = mode === 'blend' && componentsValid && marks !== null ? !inverse && v !== null
    ? calculateBlendDraw(builtComponents, v, marks, scale)
    : inverse && referenceIndex >= 0 && d !== null ? calculateBlendReconstitution(builtComponents, referenceIndex, d, doseUnit, marks, scale) : null : null;
  const result = mode === 'blend' ? blendResult : singleResult;
  const liquidVolume = result && 'liquidVolumeML' in result && typeof result.liquidVolumeML === 'number' ? result.liquidVolumeML : null;
  const mismatch = mode !== 'blend' && d !== null && converted === null;
  const exceeds = mode !== 'blend' && a !== null && converted !== null && converted > a;
  const refAmount = reference ? positive(reference.amount) : null;
  const refDose = reference && d !== null ? convertDose(d, doseUnit, reference.unit) : null;
  const refMismatch = mode === 'blend' && inverse && reference !== null && d !== null && refDose === null;
  const refExceeds = mode === 'blend' && inverse && refAmount !== null && refDose !== null && refDose > refAmount;
  const rate = drawMarksPerML(scale);
  const drawExceeds = mode === 'blend' && !inverse && marks !== null && v !== null && rate !== null && marks / rate > v;
  const availableVials = data.vials.filter(vial => !inverse || vial.kind === 'powder');
  function chooseMode(next: Mode) {
    setMode(next);
    if (next === 'recon' && data.vials.find(vial => vial.id === vialId)?.kind === 'pen') setVialId('');
  }
  function selectVial(id: string) {
    setVialId(id);
    const vial = data.vials.find(item => item.id === id);
    if (!vial) return;
    setVolume(String(vial.volumeML));
    const peptide = data.peptides.find(item => item.id === vial.peptideId);
    if (peptide?.components?.length) {
      const rows = peptide.components.filter(component => component.unit !== 'units').map(component => ({ id: crypto.randomUUID(), name: component.name, amount: String(component.amount), unit: component.unit as ContentUnit }));
      setComponents(rows.length >= 2 ? rows : [blankComponent(), blankComponent()]);
      setReferenceId(rows[0]?.id ?? '');
      if (rows[0]) setDoseUnit(rows[0].unit);
      if (mode !== 'blend') { setBlendDirection(mode === 'recon' ? 'recon' : 'draw'); setMode('blend'); }
    } else if (vial.unit !== 'units') {
      setAmount(String(vial.amount)); setContentUnit(vial.unit); setDoseUnit(vial.unit);
    }
  }
  function updateComponent(id: string, patch: Partial<ComponentDraft>) { setComponents(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row)); }
  const scaleFields = <div className="calc-scale stack">
    <Field label={t('Skala på sprøyten eller pennen', 'Syringe or pen scale')}><select value={scaleKind} onChange={event => setScaleKind(event.target.value as DrawScale['kind'])}><option value="u100">{t('U-100 · 100 U per ml', 'U-100 · 100 U per ml')}</option><option value="clicks">{t('Pennklikk · egen skala', 'Pen clicks · custom scale')}</option></select></Field>
    {scaleKind === 'clicks' ? <><Field label={t('Hvor mange klikk tilsvarer 1 ml på din penn?', 'How many clicks equal 1 ml on your pen?')}><input inputMode="decimal" type="number" min="0" step="any" value={clicksPerML} placeholder={t('Oppgi pennens skala', 'Enter your pen’s scale')} onChange={event => setClicksPerML(event.target.value)} /></Field><p className="muted scale-note">{t('Klikk og U er ulike skalaer. Bruk oppgitt antall klikk per ml for din penn.', 'Clicks and U are different scales. Use your pen’s stated number of clicks per ml.')}</p></> : <p className="muted scale-note">{t('1 U på en U-100-skala = 0,01 ml.', '1 U on a U-100 scale = 0.01 ml.')}</p>}
  </div>;
  const drawField = <Field label={inverse ? t(`Ønsket uttrekk (${marksLabel})`, `Desired draw (${marksLabel})`) : t(`Hvor mye trekker du opp (${marksLabel})?`, `How much do you draw (${marksLabel})?`)}><input inputMode="decimal" type="number" min="0" step="any" value={markCount} onChange={event => setMarkCount(event.target.value)} placeholder="—" /></Field>;
  return <div className="stack calculator-workspace">
    <div className="calculator-tabs" role="group" aria-label={t('Velg beregning', 'Choose calculation')}>{([
      { id: 'draw', nb: 'Uttrekk', en: 'Draw', icon: Syringe },
      { id: 'recon', nb: 'Væske', en: 'Liquid', icon: Droplets },
      { id: 'blend', nb: 'Blend', en: 'Blend', icon: Layers3 },
    ] as const).map(tab => <button type="button" key={tab.id} className={mode === tab.id ? 'active' : ''} aria-pressed={mode === tab.id} onClick={() => chooseMode(tab.id)}><tab.icon size={17} />{language === 'nb' ? tab.nb : tab.en}</button>)}</div>
    <div className="calculator-layout"><section className="card stack calculator-inputs">
      <div><h2>{mode === 'draw' ? t('Fra din dose til uttrekk', 'From your dose to a draw') : mode === 'recon' ? t('Hvor mye væske trenger glasset?', 'How much liquid does the vial need?') : t('Hva inneholder hvert uttrekk?', 'What is in each draw?')}</h2><p className="muted">{mode === 'draw' ? t('Oppgi innhold, væskevolum og din egen dose.', 'Enter the content, liquid volume and your own dose.') : mode === 'recon' ? t('Oppgi innholdet og din egen dose. Velg ønsket uttrekk for å beregne væskevolumet.', 'Enter the content and your own dose. Choose your desired draw to calculate the liquid volume.') : t('Oppgi mengden av hver komponent i hele glasset. Appen viser dem separat per uttrekk.', 'Enter each component’s amount in the entire vial. See each one separately per draw.')}</p></div>
      {mode === 'blend' && <div className="button-row calculator-direction" role="group" aria-label={t('Beregning for blend', 'Blend calculation')}><button type="button" className={blendDirection === 'draw' ? 'primary' : 'secondary'} aria-pressed={blendDirection === 'draw'} onClick={() => setBlendDirection('draw')}>{t('Jeg kjenner væskevolumet', 'I know the liquid volume')}</button><button type="button" className={blendDirection === 'recon' ? 'primary' : 'secondary'} aria-pressed={blendDirection === 'recon'} onClick={() => setBlendDirection('recon')}>{t('Jeg vil velge uttrekk', 'I want to choose the draw')}</button></div>}
      {availableVials.length > 0 && <Field label={t('Hent egne tall fra en beholder (valgfritt)', 'Use your recorded container values (optional)')}><select value={availableVials.some(vial => vial.id === vialId) ? vialId : ''} onChange={event => selectVial(event.target.value)}><option value="">{t('Skriv inn selv', 'Enter manually')}</option>{availableVials.map(vial => <option key={vial.id} value={vial.id}>{data.peptides.find(peptide => peptide.id === vial.peptideId)?.name} · {vial.kind === 'pen' ? t('Penn', 'Pen') : t('Glass', 'Vial')}</option>)}</select></Field>}
      <section className="calc-step stack"><h3><span>1</span>{t('Innholdet i hele glasset', 'Content in the entire vial')}</h3>
        {mode !== 'blend' ? <div className="form-grid"><Field label={t('Total mengde i glasset', 'Total amount in the vial')}><input inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={event => setAmount(event.target.value)} placeholder="—" /></Field><Field label={t('Enhet for innhold', 'Content unit')}><ContentUnitSelect value={contentUnit} onChange={setContentUnit} language={language} /></Field></div> : <><div className="blend-component-inputs">{components.map((component, index) => <div className="blend-component-row" key={component.id}><Field label={`${t('Komponent', 'Component')} ${index + 1}`}><input value={component.name} onChange={event => updateComponent(component.id, { name: event.target.value })} placeholder={t('Navn', 'Name')} maxLength={120} /></Field><Field label={t('Mengde i hele glasset', 'Amount in entire vial')}><input inputMode="decimal" type="number" min="0" step="any" value={component.amount} onChange={event => updateComponent(component.id, { amount: event.target.value })} placeholder="—" /></Field><Field label={t('Enhet', 'Unit')}><ContentUnitSelect value={component.unit} onChange={unit => updateComponent(component.id, { unit })} language={language} /></Field>{components.length > 2 && <button type="button" className="icon-button" aria-label={t(`Fjern komponent ${index + 1}`, `Remove component ${index + 1}`)} onClick={() => { setComponents(rows => rows.filter(row => row.id !== component.id)); if (referenceId === component.id) setReferenceId(''); }}><Trash2 size={16} /></button>}</div>)}</div><button type="button" className="text-button" disabled={components.length >= 12} onClick={() => setComponents(rows => [...rows, blankComponent()])}><Plus size={15} />{t('Legg til komponent', 'Add component')}</button></>}
      </section>
      <section className="calc-step stack"><h3><span>2</span>{mode === 'blend' && !inverse ? t('Væskevolumet i glasset', 'Liquid volume in the vial') : t('Mengden du ønsker per uttrekk', 'The amount you want per draw')}</h3>
        {mode === 'blend' && inverse && <><Field label={t('Hvilken komponent styrer beregningen?', 'Which component sets the calculation?')}><select value={referenceId} onChange={event => { const selected = components.find(component => component.id === event.target.value); setReferenceId(event.target.value); if (selected) setDoseUnit(selected.unit); }}><option value="">{t('Velg én komponent', 'Choose one component')}</option>{components.filter(component => component.name.trim()).map(component => <option key={component.id} value={component.id}>{component.name}</option>)}</select></Field><p className="muted scale-note">{t('En blend har et fast blandingsforhold. Velg én komponent som utgangspunkt; de andre følger samme andel.', 'A blend has a fixed ratio. Choose one reference component; all others follow the same fraction.')}</p></>}
        {(mode !== 'blend' || inverse) && <div className="form-grid"><Field label={reference && mode === 'blend' ? t(`Din dose av ${reference.name}`, `Your dose of ${reference.name}`) : t('Din dose per uttrekk', 'Your dose per draw')}><input inputMode="decimal" type="number" min="0" step="any" value={dose} onChange={event => setDose(event.target.value)} placeholder="—" /></Field><Field label={t('Enhet for dosen', 'Dose unit')}><ContentUnitSelect value={doseUnit} onChange={setDoseUnit} language={language} /></Field></div>}
        {!inverse && <Field label={t('Totalt væskevolum i glasset (ml)', 'Total liquid volume in the vial (ml)')}><input inputMode="decimal" type="number" min="0" step="any" value={volume} onChange={event => setVolume(event.target.value)} placeholder="—" /></Field>}
      </section>
      <section className="calc-step stack"><h3><span>3</span>{t('Uttrekk og skala', 'Draw and scale')}</h3>{scaleFields}{(inverse || mode === 'blend') && drawField}</section>
      {(mismatch || refMismatch) && <p role="alert" className="error">{t('Disse enhetene kan ikke konverteres. IE kan bare sammenlignes med IE; mg og mcg kan konverteres.', 'These units cannot be converted. IU can only be compared with IU; mg and mcg can be converted.')}</p>}
      {(exceeds || refExceeds) && <p role="alert" className="error">{t('Dosen du har oppgitt er større enn mengden i hele glasset.', 'The entered dose exceeds the amount in the entire vial.')}</p>}
      {drawExceeds && <p role="alert" className="error">{t('Uttrekket er større enn hele væskevolumet i glasset.', 'The draw exceeds the entire liquid volume in the vial.')}</p>}
    </section>
    <section className="stack calculator-output" aria-live="polite"><div className="card calculator-result"><div className="result-icon">{inverse ? <Droplets size={26} /> : <Syringe size={26} />}</div><p className="eyebrow">{inverse ? t('BEREGNET VÆSKEVOLUM', 'CALCULATED LIQUID VOLUME') : t('DITT UTTREKK', 'YOUR DRAW')}</p><div className="calculator-number">{result ? n(inverse ? liquidVolume! : result.drawMarks) : '—'}<span>{inverse ? t('ml væske til glasset', 'ml liquid for the vial') : marksLabel}</span></div>
      {!result && <p className="muted calculator-placeholder">{t('Fyll inn tallene dine for å se resultatet.', 'Enter your values to see the result.')}</p>}
      <div className="result-divider" />{inverse && <div className="list-row"><span className="muted">{t('Valgt uttrekk', 'Chosen draw')}</span><strong>{result ? n(result.drawMarks) : '—'} {marksLabel}</strong></div>}<div className="list-row"><span className="muted">{t('Volum per uttrekk', 'Volume per draw')}</span><strong>{result ? n(result.doseVolumeML) : '—'} ml</strong></div><div className="list-row"><span className="muted">{t('Hele uttrekk per glass', 'Whole draws per vial')}</span><strong>{result ? n(result.wholeDoses) : '—'}</strong></div>
      {blendResult && <div className="blend-result-list"><h3>{t('I hvert uttrekk får du', 'Each draw contains')}</h3>{blendResult.components.map((component, index) => <div className="list-row" key={components[index].id}><span>{component.name}</span><strong>{n(component.amount)} {unitLabel(component.unit, language)}</strong></div>)}</div>}
      {result && mode !== 'blend' && d !== null && <div className="list-row"><span className="muted">{t('Din oppgitte dose', 'Your entered dose')}</span><strong>{n(d)} {unitLabel(doseUnit, language)}</strong></div>}
    </div><div className="card calculator-info"><Info size={18} /><div><h3>{mode === 'blend' ? t('Samme blanding i hvert uttrekk', 'The same mixture in every draw') : inverse ? t('Beregning av væske, fra dine tall', 'Liquid calculation, from your values') : t('Beregning fra dine egne tall', 'Calculated from your own values')}</h3><p className="muted">{mode === 'blend' ? t('Væske endrer konsentrasjonen av alle komponentene samtidig. Mengdene per uttrekk følger alltid forholdet du har lagt inn for hele glasset.', 'Liquid changes every component’s concentration together. The amounts per draw always follow the ratio entered for the entire vial.') : inverse ? t('Resultatet er et totalt væskevolum, for eksempel BAC-vann. Beregningen forutsetter at tilsatt væske tilsvarer volumet etter blanding.', 'The result is a total liquid volume, for example BAC water. The calculation assumes added liquid equals the volume after mixing.') : t('Mengden er den du selv har lagt inn. U-100 og pennklikk bruker hver sin skala.', 'The dose is the one you entered yourself. U-100 and pen clicks use separate scales.')}</p></div></div></section>
    </div>
  </div>;
}
