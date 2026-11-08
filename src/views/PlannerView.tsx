import { useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, Copy, Edit3, Layers3, Play, Plus, Trash2, X } from 'lucide-react';
import type { CycleItem, DosePhase, DoseUnit, Peptide, Protocol, SavedCycle, ScheduleRule } from '../core/types';
import { addDays, isDay, plannedDoses, todayDay } from '../core/schedule';
import { catalog } from '../core/catalog';
import { Modal, Field, UnitSelect, numberText, dateText, unitLabel, type ViewProps } from './shared';

type DraftPhase = { id: string; amount: string; unit: DoseUnit; duration: string };
type DraftItem = { id: string; peptideName: string; color: string; amount: string; unit: DoseUnit; kind: ScheduleRule['kind']; interval: string; weekdays: number[]; daysOn: string; daysOff: string; weeks: string; phases: DraftPhase[] };
const uid = () => crypto.randomUUID();
const blankRow = (): DraftItem => ({ id: uid(), peptideName: '', color: '#4ce0bd', amount: '', unit: 'mg', kind: 'interval', interval: '1', weekdays: [], daysOn: '', daysOff: '', weeks: '', phases: [] });
function rowFromItem(item: CycleItem): DraftItem {
  return { ...blankRow(), id: item.id, peptideName: item.peptideName, color: item.color, amount: String(item.amount), unit: item.unit, weeks: String(item.weeks), kind: item.rule.kind,
    interval: item.rule.kind === 'interval' ? String(item.rule.days) : '1', weekdays: item.rule.kind === 'weekdays' ? item.rule.days : [],
    daysOn: item.rule.kind === 'cycle' ? String(item.rule.daysOn) : '', daysOff: item.rule.kind === 'cycle' ? String(item.rule.daysOff) : '',
    phases: item.phases.length > 1 || item.phases.some(p => p.durationDays !== null || p.amount !== item.amount || p.unit !== item.unit) ? item.phases.map(p => ({ id: p.id, amount: String(p.amount), unit: p.unit, duration: p.durationDays === null ? '' : String(p.durationDays) })) : [] };
}
const positive = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= Number.MAX_SAFE_INTEGER;
const whole = (value: string, min = 1, max = 3660) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
function buildItem(row: DraftItem): CycleItem | null {
  if (!row.peptideName.trim() || !whole(row.weeks, 1, 260) || !positive(row.amount)) return null;
  let rule: ScheduleRule;
  if (row.kind === 'interval') { if (!whole(row.interval)) return null; rule = { kind: 'interval', days: Number(row.interval) }; }
  else if (row.kind === 'weekdays') { if (!row.weekdays.length) return null; rule = { kind: 'weekdays', days: row.weekdays }; }
  else { if (!whole(row.daysOn) || !whole(row.daysOff, 0)) return null; rule = { kind: 'cycle', daysOn: Number(row.daysOn), daysOff: Number(row.daysOff) }; }
  let phases: DosePhase[] = [{ id: row.id, amount: Number(row.amount), unit: row.unit, durationDays: null }];
  if (row.phases.length) {
    if (row.phases.some((p, i) => !positive(p.amount) || (p.duration !== '' && !whole(p.duration)) || (p.duration === '' && i !== row.phases.length - 1))) return null;
    phases = row.phases.map(p => ({ id: p.id, amount: Number(p.amount), unit: p.unit, durationDays: p.duration === '' ? null : Number(p.duration) }));
  }
  return { id: row.id, peptideName: row.peptideName.trim(), color: row.color, amount: Number(row.amount), unit: row.unit, rule, weeks: Number(row.weeks), phases };
}
function itemProtocol(item: CycleItem, start: string): Protocol {
  return { id: item.id, peptideId: '', name: item.peptideName, startDay: start, endDay: addDays(start, item.weeks * 7 - 1), isActive: true, rule: item.rule, phases: item.phases, reminderMinuteOfDay: 480 };
}
function summarize(items: CycleItem[], start: string) {
  if (!isDay(start)) return [];
  const totals = new Map<string, { name: string; unit: DoseUnit; amount: number; count: number }>();
  for (const item of items) for (const dose of plannedDoses(itemProtocol(item, start), start, addDays(start, item.weeks * 7 - 1))) {
    const key = `${item.peptideName.toLowerCase()}|${dose.unit}`;
    const entry = totals.get(key) ?? { name: item.peptideName, unit: dose.unit, amount: 0, count: 0 };
    entry.amount += dose.amount; entry.count += 1; totals.set(key, entry);
  }
  return [...totals.values()];
}

export function PlannerView({ data, update, language }: ViewProps) {
  const t = (nb: string, en: string) => language === 'nb' ? nb : en;
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<DraftItem[]>([blankRow()]);
  const [startDay, setStartDay] = useState(todayDay());
  const [startCycle, setStartCycle] = useState<SavedCycle | null>(null);
  const [time, setTime] = useState('08:00');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [needsOpen, setNeedsOpen] = useState(false);
  const built = rows.map(buildItem);
  const complete = built.every((item): item is CycleItem => item !== null);
  const preview = useMemo(() => summarize(rows.map(buildItem).filter((item): item is CycleItem => item !== null), startDay), [rows, startDay]);
  const weekdayNames = language === 'nb' ? ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const patchRow = (id: string, change: Partial<DraftItem>) => setRows(old => old.map(row => row.id === id ? { ...row, ...change } : row));
  const patchPhase = (rowId: string, phaseId: string, change: Partial<DraftPhase>) => setRows(old => old.map(row => row.id === rowId ? { ...row, phases: row.phases.map(p => p.id === phaseId ? { ...p, ...change } : p) } : row));
  function openEditor(cycle?: SavedCycle) {
    setEditing(cycle?.id ?? null); setName(cycle?.name ?? ''); setRows(cycle?.items.map(rowFromItem) ?? [blankRow()]); setStartDay(todayDay()); setError('');
  }
  function validateBlends(items: CycleItem[], peptides: Peptide[], requireSetup: boolean) {
    const normalized = (name: string) => name.toLocaleLowerCase().trim();
    for (const item of items) {
      const existing = peptides.find(peptide => normalized(peptide.name) === normalized(item.peptideName));
      const entry = catalog.find(peptide => normalized(peptide.name) === normalized(item.peptideName));
      const isBlend = Boolean(existing?.components?.length || entry?.componentNames.length);
      if (item.phases.some(phase => !Number.isFinite(phase.amount) || phase.amount <= 0 || phase.amount > Number.MAX_SAFE_INTEGER)) {
        throw new Error(t(`Kontroller mengdene i «${item.peptideName}».`, `Check the amounts in “${item.peptideName}”.`));
      }
      if (!isBlend) continue;
      if (item.unit !== 'units' || item.phases.some(phase => phase.unit !== 'units')) {
        throw new Error(t(`«${item.peptideName}» er en blend. Velg E (U-100) for mengden og alle fasene.`, `“${item.peptideName}” is a blend. Choose units (U-100) for the amount and every phase.`));
      }
      if (requireSetup && (!existing?.components?.length || existing.components.some(component => !component.name.trim() || !Number.isFinite(component.amount) || component.amount <= 0 || component.unit === 'units') || entry?.componentNames.some(name => !existing.components?.some(component => normalized(component.name) === normalized(name))))) {
        throw new Error(t(`Opprett eller rediger «${item.peptideName}» under Peptider og legg inn komponentmengdene før du starter syklusen.`, `Create or edit “${item.peptideName}” under Peptides and enter the component amounts before starting this cycle.`));
      }
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!name.trim() || !complete || !rows.length) { setError(t('Fyll ut navn, mengde, varighet og frekvens for alle radene.', 'Enter a name, amount, duration and frequency for every item.')); return; }
    setBusy(true);
    try {
      const cycle: SavedCycle = { id: editing ?? uid(), name: name.trim(), items: built as CycleItem[], lastStartedAt: data.cycles.find(c => c.id === editing)?.lastStartedAt ?? null };
      await update(current => { validateBlends(cycle.items, current.peptides, false); return { ...current, cycles: editing ? current.cycles.map(c => c.id === editing ? cycle : c) : [...current.cycles, cycle] }; });
      setEditing(undefined); setNotice(t('Syklusen er lagret som en mal.', 'Cycle saved as a template.'));
    } catch (e) { setError(e instanceof Error ? e.message : t('Kunne ikke lagre.', 'Could not save.')); }
    finally { setBusy(false); }
  }
  async function removeCycle(cycle: SavedCycle) {
    if (!window.confirm(t(`Slette «${cycle.name}»? Aktive protokoller beholdes.`, `Delete “${cycle.name}”? Active protocols will be kept.`))) return;
    try { await update(current => ({ ...current, cycles: current.cycles.filter(c => c.id !== cycle.id) })); }
    catch (e) { setError(e instanceof Error ? e.message : t('Kunne ikke slette.', 'Could not delete.')); }
  }
  async function start(event: FormEvent) {
    event.preventDefault(); if (!startCycle || !isDay(startDay) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return;
    setBusy(true); setError('');
    try {
      const cycle = startCycle;
      await update(current => {
        validateBlends(cycle.items, current.peptides, true);
        const peptides = [...current.peptides];
        const protocols = [...current.protocols];
        for (const item of cycle.items) {
          let peptide = peptides.find(p => p.name.toLowerCase().trim() === item.peptideName.toLowerCase().trim());
          if (!peptide) { peptide = { id: uid(), name: item.peptideName, color: item.color, notes: '' }; peptides.push(peptide); }
          const [hours, minutes] = time.split(':').map(Number);
          protocols.push({ ...itemProtocol(item, startDay), id: uid(), peptideId: peptide.id, name: cycle.name, reminderMinuteOfDay: hours * 60 + minutes });
        }
        return { ...current, peptides, protocols, cycles: current.cycles.map(c => c.id === cycle.id ? { ...c, lastStartedAt: new Date().toISOString() } : c) };
      });
      setStartCycle(null); setNotice(t('Syklusen er startet. Dosene ligger i kalenderen.', 'Cycle started. Your doses are now in the calendar.'));
    } catch (e) { setError(e instanceof Error ? e.message : t('Kunne ikke starte syklusen.', 'Could not start cycle.')); }
    finally { setBusy(false); }
  }
  const activeNeeds = useMemo(() => {
    const totals = new Map<string, { name: string; unit: DoseUnit; amount: number; count: number }>();
    const from = todayDay(); const through = addDays(from, 29);
    for (const protocol of data.protocols.filter(p => p.isActive)) for (const dose of plannedDoses(protocol, from, through)) {
      const peptide = data.peptides.find(p => p.id === protocol.peptideId); const name = peptide?.name ?? protocol.name; const key = `${name}|${dose.unit}`;
      const entry = totals.get(key) ?? { name, unit: dose.unit, amount: 0, count: 0 }; entry.amount += dose.amount; entry.count += 1; totals.set(key, entry);
    }
    return [...totals.values()];
  }, [data.protocols, data.peptides]);
  function needsList(needs: ReturnType<typeof summarize>) { return <div className="needs-list">{needs.map((need, index) => <div className="list-row" key={`${need.name}-${need.unit}-${index}`}><div><strong>{need.name}</strong><small className="muted">{need.count} {t('planlagte doser', 'planned doses')}</small></div><strong>{numberText(need.amount, language)} {unitLabel(need.unit, language)}</strong></div>)}</div>; }

  return <div className="page-section planner-view">
    <div className="section-heading"><div><p className="eyebrow">{t('DIN PLAN', 'YOUR PLAN')}</p><h2>{t('Planlegg fremover', 'Plan ahead')}</h2><p className="muted">{t('Bygg en syklus med dine egne valg. Start når du er klar.', 'Build a cycle with your own choices. Start when you are ready.')}</p></div><button className="button primary" onClick={() => openEditor()}><Plus size={18} />{t('Ny syklus', 'New cycle')}</button></div>
    {notice && <div className="notice" role="status">{notice}<button className="icon-button" aria-label={t('Lukk', 'Dismiss')} onClick={() => setNotice('')}><X size={16} /></button></div>}
    {error && editing === undefined && !startCycle && <p className="error" role="alert">{error}</p>}
    <button className="card active-needs-card" onClick={() => setNeedsOpen(true)}><div className="icon-chip"><CalendarDays size={24} /></div><div><h3>{t('Behov for aktive protokoller', 'Active protocol needs')}</h3><p className="muted">{t('Dine planlagte mengder de neste 30 dagene', 'Your planned amounts over the next 30 days')}</p></div><span aria-hidden="true">→</span></button>
    <div className="section-heading"><h3>{t('Lagrede sykluser', 'Saved cycles')}</h3><span className="muted">{data.cycles.length}</span></div>
    {!data.cycles.length ? <div className="card empty-state"><Layers3 size={36} /><h3>{t('Fra tanke til plan', 'From idea to plan')}</h3><p className="muted">{t('Samle peptider, frekvens og varighet i en gjenbrukbar syklus.', 'Combine peptides, frequency and duration in a reusable cycle.')}</p><button className="button secondary" onClick={() => openEditor()}><Plus size={18} />{t('Lag din første syklus', 'Create your first cycle')}</button></div> : <div className="cycle-grid">{data.cycles.map(cycle => <article className="card cycle-card" key={cycle.id}><div className="section-heading"><div className="icon-chip"><Layers3 size={22} /></div>{cycle.lastStartedAt && <span className="badge success">{t('Startet', 'Started')}</span>}</div><h3>{cycle.name}</h3><p className="muted">{cycle.items.length} {t('peptider', 'peptides')} · {Math.max(...cycle.items.map(i => i.weeks), 0)} {t('uker', 'weeks')}</p><div className="cycle-peptides">{cycle.items.map(item => <span className="badge" key={item.id}><span className="color-dot" style={{ background: item.color }} />{item.peptideName}</span>)}</div>{cycle.lastStartedAt && <small className="muted">{t('Sist startet', 'Last started')}: {dateText(cycle.lastStartedAt.slice(0, 10), language)}</small>}<div className="card-actions"><button className="button primary" onClick={() => { setStartCycle(cycle); setStartDay(todayDay()); setError(''); }}><Play size={16} />{t('Start syklus', 'Start cycle')}</button><button className="icon-button" aria-label={t('Rediger syklus', 'Edit cycle')} onClick={() => openEditor(cycle)}><Edit3 size={18} /></button><button className="icon-button" aria-label={t('Kopier syklus', 'Duplicate cycle')} onClick={() => { openEditor({ ...cycle, id: '', name: `${cycle.name} (${t('kopi', 'copy')})`, items: cycle.items.map(i => ({ ...i, id: uid() })), lastStartedAt: null }); setEditing(null); }}><Copy size={18} /></button><button className="icon-button danger" aria-label={t('Slett syklus', 'Delete cycle')} onClick={() => void removeCycle(cycle)}><Trash2 size={18} /></button></div></article>)}</div>}

    {editing !== undefined && <Modal title={editing ? t('Rediger syklus', 'Edit cycle') : t('Ny syklus', 'New cycle')} onClose={() => !busy && setEditing(undefined)}><form onSubmit={save} className="stack"><Field label={t('Navn på syklusen', 'Cycle name')}><input required value={name} onChange={e => setName(e.target.value)} maxLength={120} /></Field><Field label={t('Startdato for estimatet', 'Estimate start date')}><input required type="date" value={startDay} onChange={e => setStartDay(e.target.value)} /></Field><p className="muted">{t('Dette lagrer en mal. Ingen protokoller aktiveres før du velger «Start syklus».', 'This saves a template. Protocols are activated only when you choose “Start cycle”.')}</p>
      {rows.map((row, index) => <div className="card cycle-editor-row stack" key={row.id}><div className="section-heading"><h3>{t('Peptid', 'Peptide')} {index + 1}</h3>{rows.length > 1 && <button type="button" className="icon-button danger" aria-label={t('Fjern rad', 'Remove item')} onClick={() => setRows(old => old.filter(r => r.id !== row.id))}><Trash2 size={18} /></button>}</div><div className="form-grid"><Field label={t('Peptidnavn', 'Peptide name')}><input list="planner-peptides" required value={row.peptideName} onChange={e => patchRow(row.id, { peptideName: e.target.value })} maxLength={120} /></Field><Field label={t('Farge', 'Color')}><input type="color" value={row.color} onChange={e => patchRow(row.id, { color: e.target.value })} /></Field><Field label={t('Din mengde per dose', 'Your amount per dose')}><input type="number" required min="0.000001" step="any" inputMode="decimal" value={row.amount} onChange={e => patchRow(row.id, { amount: e.target.value })} /></Field><Field label={t('Enhet', 'Unit')}><UnitSelect value={row.unit} onChange={unit => patchRow(row.id, { unit })} language={language} /></Field><Field label={t('Varighet i uker', 'Duration in weeks')}><input type="number" required min="1" max="260" step="1" value={row.weeks} onChange={e => patchRow(row.id, { weeks: e.target.value })} /></Field><Field label={t('Frekvens', 'Frequency')}><select value={row.kind} onChange={e => patchRow(row.id, { kind: e.target.value as ScheduleRule['kind'] })}><option value="interval">{t('Hver N. dag', 'Every N days')}</option><option value="weekdays">{t('Faste ukedager', 'Weekdays')}</option><option value="cycle">{t('Dager på / av', 'Days on / off')}</option></select></Field></div>
        {row.kind === 'interval' && <Field label={t('Antall dager mellom doser', 'Days between doses')}><input type="number" required min="1" max="3660" step="1" value={row.interval} onChange={e => patchRow(row.id, { interval: e.target.value })} /></Field>}
        {row.kind === 'weekdays' && <fieldset className="weekday-picker"><legend>{t('Velg dager', 'Choose days')}</legend>{[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day} className={row.weekdays.includes(day) ? 'selected' : ''}><input type="checkbox" checked={row.weekdays.includes(day)} onChange={e => patchRow(row.id, { weekdays: e.target.checked ? [...row.weekdays, day] : row.weekdays.filter(d => d !== day) })} />{weekdayNames[day]}</label>)}</fieldset>}
        {row.kind === 'cycle' && <div className="form-grid"><Field label={t('Dager på', 'Days on')}><input type="number" required min="1" step="1" value={row.daysOn} onChange={e => patchRow(row.id, { daysOn: e.target.value })} /></Field><Field label={t('Dager av', 'Days off')}><input type="number" required min="0" step="1" value={row.daysOff} onChange={e => patchRow(row.id, { daysOff: e.target.value })} /></Field></div>}
        <label className="toggle-row"><input type="checkbox" checked={row.phases.length > 0} onChange={e => patchRow(row.id, { phases: e.target.checked ? [{ id: uid(), amount: row.amount, unit: row.unit, duration: '' }] : [] })} />{t('Bruk egne doseringsfaser', 'Use your own dose phases')}</label>
        {row.phases.map((phase, phaseIndex) => <div className="phase-row" key={phase.id}><span className="eyebrow">{t('Fase', 'Phase')} {phaseIndex + 1}</span><div className="form-grid"><Field label={t('Mengde', 'Amount')}><input type="number" required min="0.000001" step="any" value={phase.amount} onChange={e => patchPhase(row.id, phase.id, { amount: e.target.value })} /></Field><Field label={t('Enhet', 'Unit')}><UnitSelect value={phase.unit} onChange={unit => patchPhase(row.id, phase.id, { unit })} language={language} /></Field><Field label={t('Antall dager (tom = resten)', 'Days (blank = remainder)')}><input type="number" min="1" step="1" required={phaseIndex < row.phases.length - 1} value={phase.duration} onChange={e => patchPhase(row.id, phase.id, { duration: e.target.value })} /></Field></div>{row.phases.length > 1 && <button type="button" className="button secondary" onClick={() => patchRow(row.id, { phases: row.phases.filter(p => p.id !== phase.id) })}>{t('Fjern fase', 'Remove phase')}</button>}</div>)}
        {row.phases.length > 0 && <button type="button" className="button secondary" onClick={() => patchRow(row.id, { phases: [...row.phases.map(p => ({ ...p, duration: p.duration || '1' })), { id: uid(), amount: '', unit: row.unit, duration: '' }] })}><Plus size={16} />{t('Legg til fase', 'Add phase')}</button>}
      </div>)}<datalist id="planner-peptides">{data.peptides.map(p => <option key={p.id} value={p.name} />)}</datalist><button type="button" className="button secondary" onClick={() => setRows(old => [...old, blankRow()])}><Plus size={18} />{t('Legg til peptid', 'Add peptide')}</button>
      {complete && preview.length > 0 && <div className="card"><h3>{t('Planlagt totalmengde', 'Planned total amount')}</h3>{needsList(preview)}<p className="muted">{t('Beregnet fra dine mengder, frekvenser og varigheter.', 'Calculated from your amounts, frequencies and durations.')}</p></div>}
      {error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(undefined)}>{t('Avbryt', 'Cancel')}</button><button className="button primary" disabled={busy}>{busy ? t('Lagrer…', 'Saving…') : t('Lagre syklus', 'Save cycle')}</button></div></form></Modal>}
    {startCycle && <Modal title={t('Start syklus', 'Start cycle')} onClose={() => !busy && setStartCycle(null)}><form onSubmit={start} className="stack"><h3>{startCycle.name}</h3><p className="muted">{t('Dette oppretter nye aktive protokoller fra malen. Starter du malen igjen, blir det opprettet nye protokoller.', 'This creates new active protocols from the template. Starting the template again creates additional protocols.')}</p><div className="form-grid"><Field label={t('Startdato', 'Start date')}><input type="date" required value={startDay} onChange={e => setStartDay(e.target.value)} /></Field><Field label={t('Planlagt tidspunkt', 'Planned time')}><input type="time" required value={time} onChange={e => setTime(e.target.value)} /></Field></div><p className="muted">{t('Tidspunktet vises i planen. Det sender ikke pushvarsler.', 'The time appears in your plan. It does not send push notifications.')}</p>{needsList(summarize(startCycle.items, startDay))}{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => setStartCycle(null)}>{t('Avbryt', 'Cancel')}</button><button className="button primary" disabled={busy}><Play size={16} />{busy ? t('Starter…', 'Starting…') : t('Bekreft og start', 'Confirm and start')}</button></div></form></Modal>}
    {needsOpen && <Modal title={t('Neste 30 dager', 'Next 30 days')} onClose={() => setNeedsOpen(false)}>{activeNeeds.length ? needsList(activeNeeds) : <p className="muted">{t('Ingen planlagte doser i perioden.', 'No doses planned in this period.')}</p>}<p className="muted">{t('Totalene viser planlagte mengder og trekker ikke fra lagerbeholdningen.', 'Totals show planned amounts and do not subtract your inventory.')}</p></Modal>}
  </div>;
}
