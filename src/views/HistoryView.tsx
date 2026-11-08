import { useMemo, useState, type FormEvent } from 'react';
import { Activity, Check, ChevronRight, ClipboardList, Plus, SkipForward, Trash2, X } from 'lucide-react';
import type { DoseUnit, InjectionLog, Measurement, Protocol } from '../core/types';
import { addDays, plannedDose, todayDay } from '../core/schedule';
import { Modal, Field, EmptyState, UnitSelect, numberText, dateText, unitLabel, type ViewProps } from './shared';

type LogDraft = { protocol: Protocol; day: string; amount: number; unit: DoseUnit; existing?: InjectionLog };
const localTime = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const minuteTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export function LogEditor({ draft, update, language, onClose }: { draft: LogDraft; update: ViewProps['update']; language: ViewProps['language']; onClose: () => void }) {
  const t = (nb: string, en: string) => language === 'nb' ? nb : en;
  const [amount, setAmount] = useState(String(draft.existing?.amount ?? draft.amount));
  const [unit, setUnit] = useState<DoseUnit>(draft.existing?.unit ?? draft.unit);
  const [time, setTime] = useState(draft.existing ? localTime(new Date(draft.existing.timestamp)) : minuteTime(draft.protocol.reminderMinuteOfDay));
  const [note, setNote] = useState(draft.existing?.note ?? '');
  const [status, setStatus] = useState<'taken' | 'skipped'>(draft.existing?.status ?? 'taken');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || !/^\d{2}:\d{2}$/.test(time)) { setError(t('Skriv inn en gyldig mengde og tid.', 'Enter a valid amount and time.')); return; }
    if (draft.protocol.phases.every(phase => phase.unit === 'units') && unit !== 'units') { setError(t('Denne protokollen bruker U-100-enheter.', 'This protocol uses U-100 units.')); return; }
    const timestamp = new Date(`${draft.day}T${time}:00`);
    if (!Number.isFinite(timestamp.getTime())) { setError(t('Ugyldig tidspunkt.', 'Invalid time.')); return; }
    setBusy(true); setError('');
    try {
      const log: InjectionLog = { ...draft.existing, id: draft.existing?.id ?? crypto.randomUUID(), protocolId: draft.protocol.id, day: draft.day, amount: Number(amount), unit, timestamp: timestamp.toISOString(), note: note.trim(), status };
      await update(data => ({ ...data, logs: [...data.logs.filter(item => !(item.protocolId === log.protocolId && item.day === log.day)), log] }));
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!draft.existing || !window.confirm(t('Slette denne oppføringen?', 'Delete this entry?'))) return;
    setBusy(true);
    try { await update(data => ({ ...data, logs: data.logs.filter(item => item.id !== draft.existing!.id) })); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  }
  return <Modal title={draft.existing ? t('Rediger logg', 'Edit entry') : t('Logg injeksjon', 'Log injection')} onClose={onClose}>
    <form onSubmit={save} className="stack">
      <div><strong>{draft.protocol.name}</strong><p className="muted">{dateText(draft.day, language)}</p></div>
      <div className="form-grid"><Field label={t('Mengde', 'Amount')}><input type="number" min="0" step="any" value={amount} required onChange={e => setAmount(e.target.value)} /></Field><Field label={t('Enhet', 'Unit')}><UnitSelect value={unit} onChange={setUnit} language={language} /></Field></div>
      <div className="form-grid"><Field label={t('Tid', 'Time')}><input type="time" value={time} required onChange={e => setTime(e.target.value)} /></Field><Field label="Status"><select value={status} onChange={e => setStatus(e.target.value as 'taken' | 'skipped')}><option value="taken">{t('Tatt', 'Taken')}</option><option value="skipped">{t('Hoppet over', 'Skipped')}</option></select></Field></div>
      <Field label={t('Notat (valgfritt)', 'Note (optional)')}><textarea value={note} rows={3} maxLength={4000} onChange={e => setNote(e.target.value)} /></Field>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="button-row">{draft.existing && <button type="button" className="button danger" disabled={busy} onClick={remove}><Trash2 size={16}/>{t('Slett', 'Delete')}</button>}<button type="submit" className="button primary" disabled={busy}>{busy ? t('Lagrer…', 'Saving…') : t('Lagre', 'Save')}</button></div>
    </form>
  </Modal>;
}

async function resizePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Image must be smaller than 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Could not read image.')); img.src = url; });
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Could not process image.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally { URL.revokeObjectURL(url); }
}

function MeasurementEditor({ existing, update, language, onClose }: { existing?: Measurement; update: ViewProps['update']; language: ViewProps['language']; onClose: () => void }) {
  const t = (nb: string, en: string) => language === 'nb' ? nb : en;
  const [day, setDay] = useState(existing?.day ?? todayDay());
  const [name, setName] = useState(existing?.name ?? '');
  const [value, setValue] = useState(existing?.value === null || existing?.value === undefined ? '' : String(existing.value));
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const [category, setCategory] = useState<Measurement['category']>(existing?.category ?? 'other');
  const [note, setNote] = useState(existing?.note ?? '');
  const [photo, setPhoto] = useState(existing?.photo);
  const [processing, setProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !day || (value.trim() && !Number.isFinite(Number(value)))) { setError(t('Kontroller navn, dato og verdi.', 'Check the name, date and value.')); return; }
    setBusy(true); setError('');
    try {
      const entry: Measurement = { id: existing?.id ?? crypto.randomUUID(), day, name: name.trim(), value: value.trim() ? Number(value) : null, unit: unit.trim(), category, note: note.trim(), ...(photo ? { photo } : {}) };
      await update(data => ({ ...data, measurements: [...data.measurements.filter(item => item.id !== entry.id), entry] })); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!existing || !window.confirm(t('Slette denne målingen?', 'Delete this measurement?'))) return;
    setBusy(true);
    try { await update(data => ({ ...data, measurements: data.measurements.filter(item => item.id !== existing.id) })); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  }
  return <Modal title={existing ? t('Rediger måling', 'Edit measurement') : t('Ny måling', 'New measurement')} onClose={onClose}>
    <form onSubmit={save} className="stack">
      <Field label={t('Navn', 'Name')}><input value={name} required maxLength={120} onChange={e => setName(e.target.value)} /></Field>
      <div className="form-grid"><Field label={t('Dato', 'Date')}><input type="date" value={day} required onChange={e => setDay(e.target.value)} /></Field><Field label={t('Kategori', 'Category')}><select value={category} onChange={e => setCategory(e.target.value as Measurement['category'])}><option value="body">{t('Kroppsmåling', 'Body measurement')}</option><option value="lab">{t('Analyse', 'Lab result')}</option><option value="other">{t('Annet', 'Other')}</option></select></Field></div>
      <div className="form-grid"><Field label={t('Verdi (valgfritt)', 'Value (optional)')}><input type="number" step="any" value={value} onChange={e => setValue(e.target.value)} /></Field><Field label={t('Enhet', 'Unit')}><input value={unit} maxLength={40} onChange={e => setUnit(e.target.value)} /></Field></div>
      <Field label={t('Notat', 'Note')}><textarea value={note} rows={3} maxLength={4000} onChange={e => setNote(e.target.value)} /></Field>
      <Field label={t('Bilde (valgfritt)', 'Photo (optional)')}><input type="file" accept="image/*" disabled={processing} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setProcessing(true); setError(''); try { setPhoto(await resizePhoto(file)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setProcessing(false); } }} /></Field>
      {processing && <p className="muted" role="status">{t('Behandler bilde…', 'Processing photo…')}</p>}
      {photo && <div className="stack"><img src={photo} alt={t('Vedlagt måling', 'Attached measurement')} style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 12, objectFit: 'contain' }} /><button type="button" className="button secondary" onClick={() => setPhoto(undefined)}><X size={16}/>{t('Fjern bilde', 'Remove photo')}</button></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="button-row">{existing && <button type="button" className="button danger" disabled={busy || processing} onClick={remove}><Trash2 size={16}/>{t('Slett', 'Delete')}</button>}<button type="submit" className="button primary" disabled={busy || processing}>{busy ? t('Lagrer…', 'Saving…') : t('Lagre', 'Save')}</button></div>
    </form>
  </Modal>;
}

function Trend({ entries, language }: { entries: Measurement[]; language: ViewProps['language'] }) {
  const sorted = [...entries].sort((a, b) => a.day.localeCompare(b.day));
  const values = sorted.map(entry => entry.value!); const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const dayValues = sorted.map(entry => Date.parse(`${entry.day}T12:00:00Z`)); const first = dayValues[0]; const duration = dayValues[dayValues.length - 1] - first;
  const points = sorted.map((entry, index) => ({ x: duration ? 20 + (dayValues[index] - first) / duration * 280 : 20 + index / Math.max(1, sorted.length - 1) * 280, y: max === min ? 60 : 100 - (entry.value! - min) / span * 80 }));
  return <article className="card trend-card"><div className="section-heading"><h3>{sorted[0].name}</h3><span className="muted">{sorted[0].unit}</span></div>
    <svg viewBox="0 0 320 120" role="img" aria-label={`${sorted[0].name}: ${sorted.map(e => `${dateText(e.day, language)} ${numberText(e.value!, language)}`).join('; ')}`} style={{ width: '100%', height: 120 }}><path d="M20 100H300" stroke="currentColor" opacity=".12"/><polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--accent, #68e5cc)" strokeWidth="2.5"/>{points.map((point, index) => <circle key={sorted[index].id} cx={point.x} cy={point.y} r="3.5" fill="var(--accent, #68e5cc)"><title>{dateText(sorted[index].day, language)}: {numberText(sorted[index].value!, language)} {sorted[index].unit}</title></circle>)}</svg>
    <div className="section-heading"><small className="muted">{dateText(sorted[0].day, language)}</small><small className="muted">{dateText(sorted[sorted.length - 1].day, language)}</small></div>
    <p className="muted">{numberText(sorted[0].value!, language)} → {numberText(sorted[sorted.length - 1].value!, language)} {sorted[0].unit}</p>
  </article>;
}

export function HistoryView({ data, update, language }: ViewProps) {
  const t = (nb: string, en: string) => language === 'nb' ? nb : en;
  const [section, setSection] = useState<'injections' | 'measurements'>('injections');
  const [logDraft, setLogDraft] = useState<LogDraft | null>(null);
  const [measurementEditor, setMeasurementEditor] = useState<Measurement | 'new' | null>(null);
  const today = todayDay();
  const history = useMemo(() => {
    const items: Array<{ key: string; day: string; protocol: Protocol | undefined; log?: InjectionLog; amount: number; unit: DoseUnit }> = data.logs.map(log => ({ key: log.id, day: log.day, protocol: data.protocols.find(p => p.id === log.protocolId), log, amount: log.amount, unit: log.unit }));
    const existing = new Set(data.logs.map(log => `${log.protocolId}:${log.day}`));
    for (let i = 0; i < 30; i++) {
      const day = addDays(today, -i);
      for (const protocol of data.protocols) {
        if (existing.has(`${protocol.id}:${day}`)) continue;
        const dose = plannedDose(protocol, day);
        if (dose) items.push({ key: `${protocol.id}:${day}`, day, protocol, amount: dose.amount, unit: dose.unit });
      }
    }
    return items.sort((a, b) => b.day.localeCompare(a.day) || (a.protocol?.reminderMinuteOfDay ?? 0) - (b.protocol?.reminderMinuteOfDay ?? 0));
  }, [data.logs, data.protocols, today]);
  const trends = useMemo(() => {
    const groups = new Map<string, Measurement[]>();
    for (const entry of data.measurements) { if (entry.value === null) continue; const key = `${entry.name.trim().toLocaleLowerCase()}|${entry.unit}|${entry.category}`; groups.set(key, [...(groups.get(key) ?? []), entry]); }
    return [...groups.entries()].filter(([, entries]) => entries.length >= 2);
  }, [data.measurements]);
  const measurements = [...data.measurements].sort((a, b) => b.day.localeCompare(a.day));
  return <div className="page-section stack">
    <div className="segmented-control" role="group" aria-label={t('Velg historikk', 'Choose history')}><button type="button" className={section === 'injections' ? 'active' : ''} aria-pressed={section === 'injections'} onClick={() => setSection('injections')}><ClipboardList size={16}/>{t('Injeksjoner', 'Injections')}</button><button type="button" className={section === 'measurements' ? 'active' : ''} aria-pressed={section === 'measurements'} onClick={() => setSection('measurements')}><Activity size={16}/>{t('Målinger', 'Measurements')}</button></div>
    {section === 'measurements' && <div className="section-heading journal-actions"><h2>{t('Dine målinger', 'Your measurements')}</h2><button className="button primary" type="button" onClick={() => setMeasurementEditor('new')}><Plus size={18}/>{t('Ny måling', 'New measurement')}</button></div>}
    {section === 'injections' ? <>
      <p className="muted">{t('Uloggede doser vises for de siste 30 dagene. En glemt dose flytter aldri planen.', 'Unlogged doses are shown for the last 30 days. A missed dose never shifts your schedule.')}</p>
      {history.length === 0 ? <EmptyState icon={<ClipboardList/>} title={t('Ingen oppføringer ennå', 'No entries yet')} description={t('Planlagte og loggede injeksjoner dukker opp her.', 'Your scheduled and logged injections will appear here.')} /> : <div className="card history-list">{history.map(item => {
        const protocol = item.protocol; const peptide = data.peptides.find(p => p.id === protocol?.peptideId); const taken = item.log?.status === 'taken'; const skipped = item.log?.status === 'skipped';
        return <button type="button" className="list-row history-row" key={item.key} disabled={!protocol} onClick={() => protocol && setLogDraft({ protocol, day: item.day, amount: item.amount, unit: item.unit, existing: item.log })}>
          <span className={`status-icon ${taken ? 'taken' : skipped ? 'skipped' : 'pending'}`} style={{ color: taken ? 'var(--accent, #68e5cc)' : undefined }}>{taken ? <Check size={18}/> : skipped ? <SkipForward size={18}/> : <ClipboardList size={18}/>}</span>
          <span className="row-main"><strong>{peptide?.name ?? protocol?.name ?? item.log?.peptideName ?? t('Slettet protokoll', 'Deleted protocol')}</strong><small className="muted">{dateText(item.day, language)}{item.log ? ` · ${localTime(new Date(item.log.timestamp))}` : ''}</small></span>
          <span className="row-end"><strong>{numberText(item.amount, language)} {unitLabel(item.unit, language)}</strong><small className={`status-label ${taken ? 'taken' : skipped ? 'skipped' : ''}`}>{taken ? t('Tatt', 'Taken') : skipped ? t('Hoppet over', 'Skipped') : t('Ikke logget', 'Not logged')}</small></span>{protocol && <ChevronRight size={16}/>}</button>;
      })}</div>}
    </> : <>
      <p className="muted">{t('Registrer dine egne tall og bilder. Målingene vises uten medisinsk tolkning.', 'Record your own values and photos. Measurements are displayed without medical interpretation.')}</p>
      {trends.length > 0 && <section className="stack"><div className="section-heading"><h2>{t('Trender', 'Trends')}</h2><span className="muted">{t('Dine registrerte verdier', 'Your recorded values')}</span></div><div className="metric-grid">{trends.map(([key, entries]) => <Trend key={key} entries={entries} language={language}/>)}</div></section>}
      {measurements.length === 0 ? <EmptyState icon={<Activity/>} title={t('Din første måling', 'Your first measurement')} description={t('Legg til en måling, analyse eller et bilde.', 'Add a measurement, lab result or photo.')} action={<button type="button" className="button primary" onClick={() => setMeasurementEditor('new')}><Plus size={16}/>{t('Legg til måling', 'Add measurement')}</button>} /> : <section className="stack"><h2>{t('Oppføringer', 'Entries')}</h2><div className="card">{measurements.map(entry => <button type="button" key={entry.id} className="list-row" onClick={() => setMeasurementEditor(entry)}>{entry.photo ? <img src={entry.photo} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }}/> : <span className="status-icon"><Activity size={18}/></span>}<span className="row-main"><strong>{entry.name}</strong><small className="muted">{dateText(entry.day, language)}</small></span><span className="row-end">{entry.value !== null && <strong>{numberText(entry.value, language)} {entry.unit}</strong>}{entry.photo && <small className="muted">{t('Bilde vedlagt', 'Photo attached')}</small>}</span><ChevronRight size={16}/></button>)}</div></section>}
    </>}
    {logDraft && <LogEditor draft={logDraft} update={update} language={language} onClose={() => setLogDraft(null)}/>}
    {measurementEditor && <MeasurementEditor existing={measurementEditor === 'new' ? undefined : measurementEditor} update={update} language={language} onClose={() => setMeasurementEditor(null)}/>}
  </div>;
}
