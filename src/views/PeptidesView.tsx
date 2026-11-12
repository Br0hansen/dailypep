import { useState, type FormEvent } from 'react';
import { Activity, Archive, ArrowUpRight, ChevronRight, FlaskConical, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Peptide, Vial } from '../core/types';
import { todayDay } from '../core/schedule';
import { daysUntilEmpty, vialRemaining } from '../core/math';
import { searchCatalog } from '../core/catalog';
import { Avatar, colors, dateText, EmptyState, Field, Modal, numberText, positive, ruleText, uid, unitLabel, UnitSelect, type ViewProps } from './shared';

type InventoryProps = ViewProps & { onAddPlan?: () => void; initialPeptideId?: string | null };

export function PeptidesView({ data, update, language, onAddPlan, initialPeptideId }: InventoryProps) {
  const t = (nb: string, en: string) => language === 'nb' ? nb : en;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(() => initialPeptideId && data.peptides.some(p => p.id === initialPeptideId) ? initialPeptideId : null);
  const [editor, setEditor] = useState<Peptide | 'new' | null>(null);
  const [vialEdit, setVialEdit] = useState<Vial | 'new' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const peptide = data.peptides.find(p => p.id === selected);
  const shown = data.peptides.filter(p => p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const protocols = data.protocols.filter(p => p.peptideId === selected);
  const vials = data.vials.filter(v => v.peptideId === selected);
  async function change(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    try { await action(); setError(''); return true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusy(false); }
  }
  async function deletePeptide(item: Peptide) {
    if (data.protocols.some(p => p.peptideId === item.id)) {
      setError(t('Dette peptidet brukes i en plan. Behold det her for å bevare planen og historikken.', 'This peptide is used by a plan. Keep it here to preserve the plan and history.'));
      return;
    }
    if (!confirm(t(`Slette ${item.name} og beholderne?`, `Delete ${item.name} and its containers?`))) return;
    const saved = await change(() => update(current => {
      if (current.protocols.some(p => p.peptideId === item.id)) throw new Error(t('Peptidet brukes nå av en plan.', 'The peptide is now used by a plan.'));
      const removedVials = new Set(current.vials.filter(v => v.peptideId === item.id).map(v => v.id));
      // Logs kept from deleted plans may still point at these containers; drop the link like deleteVial does.
      return { ...current, peptides: current.peptides.filter(p => p.id !== item.id), vials: current.vials.filter(v => !removedVials.has(v.id)), logs: current.logs.map(log => log.vialId && removedVials.has(log.vialId) ? { ...log, vialId: undefined } : log) };
    }));
    if (saved) setSelected(null);
  }
  async function deleteVial(vial: Vial) {
    if (!confirm(t('Slette beholderen? Historikken beholdes, og koblinger fra planer fjernes.', 'Delete this container? History is kept and links from plans are removed.'))) return;
    await change(() => update(current => ({
      ...current,
      vials: current.vials.filter(v => v.id !== vial.id),
      protocols: current.protocols.map(protocol => protocol.vialId === vial.id ? { ...protocol, vialId: undefined } : protocol),
      logs: current.logs.map(log => log.vialId === vial.id ? { ...log, vialId: undefined } : log),
    })));
  }
  return <div className="stack inventory-content">
    {error && <p role="alert" className="error">{error}</p>}
    {peptide ? <>
      <button className="button text-button" onClick={() => setSelected(null)}>← {t('Til beholdning', 'Back to inventory')}</button>
      <section className="card peptide-detail-header">
        <Avatar name={peptide.name} color={peptide.color}/>
        <div className="grow"><h2>{peptide.name}</h2>{peptide.notes && <p className="muted">{peptide.notes}</p>}</div>
        <div className="inline-actions">
          <button className="icon-button" aria-label={t('Rediger peptid', 'Edit peptide')} onClick={() => setEditor(peptide)}><Pencil size={18}/></button>
          <button className="icon-button danger" aria-label={t('Slett peptid', 'Delete peptide')} disabled={busy} onClick={() => void deletePeptide(peptide)}><Trash2 size={18}/></button>
        </div>
      </section>
      {!!peptide.components?.length && <section className="card stack">
        <div className="section-heading"><h3>{t('Blend-komponenter', 'Blend components')}</h3><button className="button text-button" onClick={() => setEditor(peptide)}>{t('Rediger', 'Edit')}</button></div>
        <div>{peptide.components.map((component, index) => <p key={index}>{component.name} · {numberText(component.amount, language)} {unitLabel(component.unit, language)}</p>)}</div>
        <p className="muted">{t('Mengdene gjelder hele beholderen. Planens blend-mengde oppgis i U-100-enheter.', 'Amounts apply to the full container. Enter a blend amount in U-100 units in your plan.')}</p>
      </section>}
      <section className="page-section">
        <div className="section-heading"><h2>{t('Glass og penner', 'Vials & pens')}</h2><button className="button primary" onClick={() => setVialEdit('new')}><Plus size={16}/>{t('Legg til beholder', 'Add container')}</button></div>
        {vials.length ? <div className="stack">{vials.map(vial => {
          const remaining = vialRemaining(vial, data.logs);
          const linkedProtocols = protocols.filter(p => p.vialId === vial.id);
          const forecast = remaining !== null && linkedProtocols.length ? daysUntilEmpty(remaining, linkedProtocols, vial.unit, todayDay()) : null;
          const expired = !!vial.expiresAt && vial.expiresAt < todayDay();
          return <article className="card stock-card" key={vial.id}>
            <div className="list-row"><div className="icon-chip"><Archive size={20}/></div><div className="grow">
              <h3>{vial.kind === 'pen' ? t('Ferdigblandet penn', 'Premixed pen') : t('Pulverglass', 'Powder vial')}</h3>
              <p className="muted">{remaining === null ? '—' : numberText(remaining, language)} / {numberText(vial.amount, language)} {unitLabel(vial.unit, language)} · {numberText(vial.volumeML, language)} ml{vial.totalClicks ? ` · ${numberText(vial.totalClicks, language)} ${t('klikk', 'clicks')}` : ''}</p>
              {forecast !== null && <p className="muted">{t(`Beregnet tom om ${forecast} dager`, `Estimated empty in ${forecast} days`)}</p>}
              {vial.expiresAt && <p className={expired ? 'danger-text' : 'muted'}>{expired ? t('Utløpt', 'Expired') : t('Utløper', 'Expires')} {dateText(vial.expiresAt, language)}</p>}
              <p className="muted">{linkedProtocols.length ? t(`Koblet til ${linkedProtocols.length} planoppføring(er)`, `Linked to ${linkedProtocols.length} plan item(s)`) : t('Ikke koblet til en plan ennå', 'Not linked to a plan yet')}</p>
            </div><div className="inline-actions">
              <button className="icon-button" aria-label={t('Rediger beholder', 'Edit container')} onClick={() => setVialEdit(vial)}><Pencil size={16}/></button>
              <button className="icon-button danger" aria-label={t('Slett beholder', 'Delete container')} disabled={busy} onClick={() => void deleteVial(vial)}><Trash2 size={16}/></button>
            </div></div>
            <div className="stock-track"><span style={{ width: `${remaining === null ? 0 : Math.min(100, Math.max(0, remaining / vial.amount * 100))}%`, backgroundColor: peptide.color }}/></div>
          </article>;
        })}</div> : <EmptyState icon={<Archive size={26}/>} title={t('Legg til en beholder', 'Add a container')} description={t('Registrer innhold og væskevolum. Du kan koble beholderen til en plan når du er klar.', 'Record content and liquid volume. Link the container to a plan when you are ready.')} action={<button className="button secondary" onClick={() => setVialEdit('new')}><Plus size={16}/>{t('Registrer glass eller penn', 'Record vial or pen')}</button>}/>}
      </section>
      <section className="page-section">
        <div className="section-heading"><h2>{t('Brukes i planer', 'Used in plans')}</h2>{onAddPlan && <button className="button secondary" onClick={onAddPlan}>{t('Se planer', 'View plans')}<ArrowUpRight size={15}/></button>}</div>
        {protocols.length ? <div className="stack">{protocols.map(protocol => <article className="card protocol-card" key={protocol.id}>
          <div className="list-row"><div className="icon-chip"><Activity size={18}/></div><div className="grow"><h3>{protocol.planName || protocol.name}</h3><p className="muted">{ruleText(protocol.rule, language)} · {dateText(protocol.startDay, language)}{protocol.endDay ? ` → ${dateText(protocol.endDay, language)}` : ''}</p></div><span className="badge">{protocol.isActive ? t('Aktiv', 'Active') : t('Pauset', 'Paused')}</span></div>
        </article>)}</div> : <p className="muted">{t('Dette peptidet er registrert i beholdningen. Opprett en plan under Planer når du vil legge til mengde og dager.', 'This peptide is in your inventory. Create a plan in Plans when you want to add an amount and schedule.')}</p>}
      </section>
    </> : <>
      <div className="section-heading"><div><h2>{t('Peptider og beholdere', 'Peptides & containers')}</h2><p className="muted">{t('Registrer det du har. Planer opprettes separat under Planer.', 'Keep track of what you have. Create schedules in Plans.')}</p></div><button className="button primary" onClick={() => setEditor('new')}><Plus size={17}/>{t('Legg til peptid', 'Add peptide')}</button></div>
      {data.peptides.length > 0 && <label className="search-field"><Search size={18}/><input aria-label={t('Søk i beholdning', 'Search inventory')} placeholder={t('Søk etter peptid…', 'Search peptides…')} value={query} onChange={event => setQuery(event.target.value)}/></label>}
      {shown.length ? <div className="peptide-grid inventory-grid">{shown.map(item => <button className="card peptide-card" key={item.id} onClick={() => setSelected(item.id)}><Avatar name={item.name} color={item.color}/><div className="grow"><h3>{item.name}</h3><p className="muted">{(() => { const vials = data.vials.filter(v => v.peptideId === item.id).length; const active = data.protocols.filter(p => p.peptideId === item.id && p.isActive).length; return `${vials} ${vials === 1 ? t('beholder', 'container') : t('beholdere', 'containers')} · ${active} ${active === 1 ? t('aktiv planoppføring', 'active plan item') : t('aktive planoppføringer', 'active plan items')}`; })()}</p></div><ChevronRight size={20}/></button>)}</div> : <EmptyState icon={<FlaskConical size={30}/>} title={query ? t('Ingen treff', 'No matches') : t('Hva har du i beholdningen?', 'What is in your inventory?')} description={query ? t('Prøv et annet navn.', 'Try a different name.') : t('Legg til et peptid, og registrer deretter glass eller penn. Dette legger ikke til doser i kalenderen.', 'Add a peptide, then record its vial or pen. This does not add doses to your calendar.')} action={!query ? <button className="button primary" onClick={() => setEditor('new')}><Plus size={16}/>{t('Legg til første peptid', 'Add your first peptide')}</button> : undefined}/>}
    </>}
    {editor && <PeptideEditor {...{ data, update, language }} peptide={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={id => { setSelected(id); setEditor(null); }}/>} 
    {vialEdit && peptide && <VialEditor {...{ data, update, language }} peptide={peptide} vial={vialEdit === 'new' ? undefined : vialEdit} onClose={() => setVialEdit(null)}/>}
  </div>;
}

export function PeptideEditor({update,language,peptide,onClose,onSaved}:ViewProps&{peptide?:Peptide,onClose:()=>void,onSaved:(id:string)=>void}) {
 const t=(nb:string,en:string)=>language==='nb'?nb:en;const [name,setName]=useState(peptide?.name||'');const [color,setColor]=useState(peptide?.color||colors[0]);const [notes,setNotes]=useState(peptide?.notes||'');const [components,setComponents]=useState(peptide?.components||[]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const suggestions=name.trim()?searchCatalog(name).slice(0,6):[];
 async function submit(event:FormEvent){event.preventDefault();if(!name.trim())return;if(components.some(c=>!c.name.trim()||!(c.amount>0))){setError(t('Fyll ut navn og mengde for hver komponent.','Enter a name and amount for each component.'));return;}setBusy(true);try{const value:Peptide={id:peptide?.id||uid(),name:name.trim(),color,notes,components};await update(current=>({...current,peptides:peptide?current.peptides.map(p=>p.id===peptide.id?value:p):[...current.peptides,value]}));onSaved(value.id);}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <Modal title={peptide?t('Rediger peptid','Edit peptide'):t('Legg til peptid','Add peptide')} onClose={onClose}><form className="stack" onSubmit={submit}><Field label={t('Navn','Name')}><input required maxLength={150} value={name} onChange={event=>setName(event.target.value)} autoFocus/></Field>{suggestions.length>0&&<div className="suggestion-list">{suggestions.map(entry=><button key={entry.name} type="button" className="suggestion" onClick={()=>{setName(entry.name);if(entry.componentNames.length&&!components.length)setComponents(entry.componentNames.map(name=>({name,amount:0,unit:'mg'})));}}>{entry.name}<small>{entry.category}</small></button>)}</div>}<fieldset className="color-picker"><legend>{t('Farge','Color')}</legend>{colors.map(value=><label key={value} style={{backgroundColor:value}}><input type="radio" name="color" value={value} checked={color===value} onChange={()=>setColor(value)}/><span className="sr-only">{value}</span></label>)}</fieldset><Field label={t('Notat','Note')}><textarea maxLength={4000} value={notes} onChange={event=>setNotes(event.target.value)}/></Field><div className="section-heading"><h3>{t('Blend (valgfritt)','Blend (optional)')}</h3><button type="button" className="button secondary" onClick={()=>setComponents([...components,{name:'',amount:0,unit:'mg'}])}><Plus size={14}/>{t('Komponent','Component')}</button></div>{components.map((component,index)=><div className="component-row" key={index}><Field label={t('Komponentnavn','Component name')}><input required value={component.name} onChange={event=>setComponents(components.map((c,i)=>i===index?{...c,name:event.target.value}:c))}/></Field><Field label={t('Innhold i hele glasset','Content in full vial')}><input type="number" required min="0.000001" step="any" value={component.amount||''} onChange={event=>setComponents(components.map((c,i)=>i===index?{...c,amount:Number(event.target.value)}:c))}/></Field><Field label={t('Enhet','Unit')}><UnitSelect value={component.unit} onChange={unit=>setComponents(components.map((c,i)=>i===index?{...c,unit}:c))} language={language}/></Field><button type="button" className="icon-button danger" aria-label={t('Fjern komponent','Remove component')} onClick={()=>setComponents(components.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></div>)}{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>{t('Avbryt','Cancel')}</button><button className="button primary" disabled={busy}>{t('Lagre peptid','Save peptide')}</button></div></form></Modal>;
}
export function VialEditor({update,language,peptide,vial,onClose}:ViewProps&{peptide:Peptide,vial?:Vial,onClose:()=>void}) {
 const t=(nb:string,en:string)=>language==='nb'?nb:en;const [kind,setKind]=useState<Vial['kind']>(vial?.kind||'powder');const [amount,setAmount]=useState(vial?String(vial.amount):'');const [unit,setUnit]=useState<Vial['unit']>(vial?.unit||'mg');const [volume,setVolume]=useState(vial?String(vial.volumeML):'');const [prepared,setPrepared]=useState(vial?.preparedAt||'');const [expires,setExpires]=useState(vial?.expiresAt||'');const [clicks,setClicks]=useState(vial?.totalClicks?String(vial.totalClicks):'');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function submit(event:FormEvent){event.preventDefault();const a=positive(amount),v=positive(volume);if(a===null||v===null){setError(t('Innhold og volum må være større enn null.','Content and volume must be greater than zero.'));return;}if(prepared&&expires&&expires<prepared){setError(t('Utløpsdato må være etter blandet/tatt i bruk.','Expiry date must be on or after preparation/opening.'));return;}const c=clicks.trim()?positive(clicks):null;if(clicks.trim()&&c===null){setError(t('Klikk i full penn må være større enn null.','Clicks in a full pen must be greater than zero.'));return;}setBusy(true);try{const value:Vial={id:vial?.id||uid(),peptideId:peptide.id,kind,amount:a,unit,volumeML:v,preparedAt:prepared||null,expiresAt:expires||null,...(c!==null?{totalClicks:c}:{})};await update(current=>({...current,vials:vial?current.vials.map(v=>v.id===vial.id?value:v):[...current.vials,value]}));onClose();}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <Modal title={vial?t('Rediger beholder','Edit container'):t('Legg til beholder','Add container')} onClose={onClose}><form className="stack" onSubmit={submit}><Field label={t('Type','Type')}><select value={kind} onChange={event=>setKind(event.target.value as Vial['kind'])}><option value="powder">{t('Pulverglass','Powder vial')}</option><option value="pen">{t('Ferdigblandet penn','Premixed pen')}</option></select></Field><div className="form-grid"><Field label={t('Totalt innhold','Total content')}><input required inputMode="decimal" type="number" min="0.000001" step="any" value={amount} onChange={event=>setAmount(event.target.value)}/></Field><Field label={t('Enhet','Unit')}><UnitSelect value={unit} onChange={setUnit} language={language}/></Field></div><Field label={kind==='powder'?t('Tilsatt væske (ml)','Added liquid (ml)'):t('Totalt væskevolum (ml)','Total liquid volume (ml)')}><input required inputMode="decimal" type="number" min="0.000001" step="any" value={volume} onChange={event=>setVolume(event.target.value)}/></Field><Field label={t('Klikk i full penn (valgfritt)','Clicks in a full pen (optional)')}><input inputMode="decimal" type="number" min="0.000001" step="any" value={clicks} onChange={event=>setClicks(event.target.value)}/></Field><div className="form-grid"><Field label={kind==='powder'?t('Blandet dato (valgfritt)','Prepared date (optional)'):t('Tatt i bruk (valgfritt)','Opened date (optional)')}><input type="date" value={prepared} onChange={event=>setPrepared(event.target.value)}/></Field><Field label={t('Utløpsdato (valgfritt)','Expiry date (optional)')}><input type="date" min={prepared||undefined} value={expires} onChange={event=>setExpires(event.target.value)}/></Field></div>{error&&<p role="alert" className="error">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>{t('Avbryt','Cancel')}</button><button className="button primary" disabled={busy}>{t('Lagre beholder','Save container')}</button></div></form></Modal>;
}
