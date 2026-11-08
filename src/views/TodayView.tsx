import { useEffect, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Flag, MoreHorizontal, Plus, SkipForward, Undo2 } from 'lucide-react';
import { addDays, plannedDose, todayDay } from '../core/schedule';
import { blendPerDose } from '../core/math';
import { doseContainer, isLastScheduledDose, nextScheduledDose, recordScheduledDose } from '../core/dailyActions';
import type { AppData, InjectionLog, PlannedDose, Protocol } from '../core/types';
import { Avatar, EmptyState, Field, Modal, dateText, numberText, uid, unitLabel, type ViewProps } from './shared';

type DoseRow = {protocol:Protocol;dose:PlannedDose};
const timeText=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
/** Pen clicks first when the container has a click count; otherwise volume and U-100 units. */
const drawHint=(info:{calculation:{volumeML:number;units:number};clicks:number|null},language:'nb'|'en')=>{
  const t=(nb:string,en:string)=>language==='nb'?nb:en;
  const ml=`${numberText(info.calculation.volumeML,language)} ml`;
  return info.clicks!==null
    ? `${numberText(Math.round(info.clicks*10)/10,language)} ${t('klikk','clicks')} · ${ml}`
    : `${ml} · ${numberText(info.calculation.units,language)} ${t('E på U-100','units on U-100')}`;
};

export function TodayView({ data, update, language, onAddPlan }: ViewProps & {onAddPlan:()=>void}) {
  const t=(nb:string,en:string)=>language==='nb'?nb:en;
  const [today,setToday]=useState(todayDay());
  useEffect(()=>{const timer=setInterval(()=>setToday(todayDay()),30000);return()=>clearInterval(timer);},[]);
  const [preview,setPreview]=useState<string|null>(null);
  const [details,setDetails]=useState<DoseRow|null>(null);
  const [calendar,setCalendar]=useState(false);
  const [month,setMonth]=useState(today.slice(0,7));
  const [busy,setBusy]=useState<string[]>([]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const doses=data.protocols.flatMap(protocol=>{const dose=plannedDose(protocol,today);return dose?[{protocol,dose}]:[];}).sort((a,b)=>a.protocol.reminderMinuteOfDay-b.protocol.reminderMinuteOfDay);
  const logFor=(row:DoseRow)=>data.logs.find(log=>log.protocolId===row.protocol.id&&log.day===row.dose.day);
  const pending=doses.filter(row=>!logFor(row));
  const registered=doses.filter(row=>logFor(row));
  const next=data.protocols.flatMap(protocol=>{const dose=nextScheduledDose(protocol,addDays(today,1));return dose?[{protocol,dose}]:[];}).sort((a,b)=>a.dose.day.localeCompare(b.dose.day)||a.protocol.reminderMinuteOfDay-b.protocol.reminderMinuteOfDay)[0];
  const week=Array.from({length:7},(_,index)=>addDays(today,index));
  async function quickLog(row:DoseRow) {
    if(busy.includes(row.protocol.id))return;
    setBusy(value=>[...value,row.protocol.id]);setError('');setNotice('');
    try{await update(current=>recordScheduledDose(current,row.protocol.id,row.dose.day,uid(),new Date().toISOString()));setNotice(t('Registrert som tatt. Du kan angre nedenfor.','Logged as taken. You can undo below.'));}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(value=>value.filter(id=>id!==row.protocol.id));}
  }
  async function undo(log:InjectionLog) {
    setBusy(value=>[...value,log.protocolId]);setError('');
    try{await update(current=>({...current,logs:current.logs.filter(item=>item.id!==log.id)}));setNotice(t('Registreringen er angret.','Entry undone.'));}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(value=>value.filter(id=>id!==log.protocolId));}
  }
  function rowView(row:DoseRow,interactive:boolean) {
    const {protocol,dose}=row;
    const peptide=data.peptides.find(item=>item.id===protocol.peptideId);
    const log=logFor(row);
    const info=doseContainer(data,protocol,log?.amount??dose.amount,log?.unit??dose.unit,dose.day,log?(log.vialId??''):undefined,log?.id);
    return <article className={`daily-row ${log?'is-registered':''}`} key={protocol.id}>
      <div className="daily-time"><Clock3 size={14}/>{timeText(protocol.reminderMinuteOfDay)}</div>
      <Avatar name={peptide?.name||protocol.name} color={peptide?.color||'#59e0ba'}/>
      <div className="daily-main"><h3>{peptide?.name||protocol.name}</h3><div className="daily-meta">{protocol.planName&&<span>{protocol.planName}</span>}<span className="daily-dose">{numberText(log?.amount??dose.amount,language)} {unitLabel(log?.unit??dose.unit,language)}</span>{isLastScheduledDose(protocol,dose)&&<span className="badge"><Flag size={12}/>{t('Siste planlagte dose','Last scheduled dose')}</span>}</div>
        {info?.calculation&&<p className="dose-hint">{drawHint({calculation:info.calculation,clicks:info.clicks},language)}</p>}
        {!info&&!log&&<p className="dose-hint muted">{t('Koble en beholder til planen for å se klikk og uttrekk.','Link a container to the plan to see clicks and draw.')}</p>}
        {info&&(info.expired||info.futurePrepared||info.insufficient||info.incompatible)&&<p className="container-warning">{info.expired?t('Koblet beholder har passert utløpsdato.','Linked container is past its expiry date.'):info.futurePrepared?t('Beholderens klargjøringsdato ligger frem i tid.','The container preparation date is in the future.'):info.incompatible?t('Kan ikke beregne volum med disse enhetene.','Volume cannot be calculated for these units.'):t('Registrert restinnhold er lavere enn denne mengden.','Recorded remaining content is below this amount.')}</p>}
      </div>
      <div className="daily-actions">{log?<><span className={`log-state ${log.status}`}><Check size={14}/>{log.status==='taken'?t('Tatt','Taken'):t('Hoppet over','Skipped')}</span>{interactive&&<button className="button secondary" disabled={busy.includes(protocol.id)} onClick={()=>void undo(log)}><Undo2 size={14}/>{t('Angre','Undo')}</button>}</>:interactive?<button className="button primary" disabled={busy.includes(protocol.id)} onClick={()=>void quickLog(row)}><Check size={16}/>{busy.includes(protocol.id)?t('Lagrer…','Saving…'):t('Logg som tatt','Log as taken')}</button>:<span className="muted">{t('Planlagt','Scheduled')}</span>}
      {interactive&&<button className="icon-button" disabled={busy.includes(protocol.id)} onClick={()=>setDetails(row)} aria-label={`${t('Detaljer for','Details for')} ${peptide?.name||protocol.name}`}><MoreHorizontal size={20}/></button>}</div>
    </article>;
  }
  const previews=preview?data.protocols.flatMap(protocol=>{const dose=plannedDose(protocol,preview);return dose?[{protocol,dose}]:[];}).sort((a,b)=>a.protocol.reminderMinuteOfDay-b.protocol.reminderMinuteOfDay):[];
  if(!data.protocols.length)return <section className="first-plan-state"><div className="first-plan-icon"><CalendarDays size={30}/></div><span className="eyebrow">{t('START HER','START HERE')}</span><h2>{t('Alt begynner med din første plan','Start with your first plan')}</h2><p className="muted">{t('Legg inn dine egne mengder og dager. Så samler vi dagens registreringer her.','Enter your own amounts and days. Your daily entries will appear here.')}</p><button className="button primary" onClick={onAddPlan}><Plus size={18}/>{t('Opprett din første plan','Create your first plan')}</button><div className="setup-preview"><span>1 · {t('Navn','Name')}</span><span>2 · {t('Mengde','Amount')}</span><span>3 · {t('Dager','Days')}</span><span>4 · {t('Se gjennom','Review')}</span></div></section>;
  return <div className="stack today-workspace">
    <section className="card daily-agenda"><div className="section-heading"><div><h2>{t('Dagens registreringer','Today’s entries')}</h2><p className="muted">{dateText(today,language)}</p></div><span className="daily-count">{registered.length} / {doses.length} {t('registrert','logged')}</span></div>
      {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="daily-notice">{notice}</p>}
      {pending.length>0&&<div className="daily-list">{pending.map(row=>rowView(row,true))}</div>}
      {!doses.length&&<div className="day-clear"><Check size={22}/><h3>{t('Ingen planlagt i dag','Nothing scheduled today')}</h3>{next?<p className="muted">{t('Neste registrering','Next entry')}: <strong>{data.peptides.find(p=>p.id===next.protocol.peptideId)?.name||next.protocol.name}</strong> · {dateText(next.dose.day,language)} {timeText(next.protocol.reminderMinuteOfDay)}</p>:<p className="muted">{data.protocols.some(p=>p.isActive)?t('Planene dine har ingen flere registreringer. Se over dem under Planer.','Your plans have no further entries. Review them in Plans.'):t('Planene dine er satt på pause. Du kan fortsette dem under Planer.','Your plans are paused. You can resume them in Plans.')}</p>}</div>}
      {registered.length>0&&<div className="registered-list"><h3 className="registered-heading">{t('Registrert','Logged')}</h3><div className="daily-list">{registered.map(row=>rowView(row,true))}</div></div>}
    </section>
    <section className="card week-overview"><div className="section-heading"><h2>{t('De neste sju dagene','The next seven days')}</h2><button className="button secondary" onClick={()=>{setMonth(today.slice(0,7));setCalendar(true);}}><CalendarDays size={16}/>{t('Åpne kalender','Open calendar')}</button></div><div className="week-strip">{week.map(day=>{const count=data.protocols.filter(p=>plannedDose(p,day)).length;return <button key={day} className={`week-day ${day===today?'is-today':''}`} onClick={()=>setPreview(day)} aria-label={`${dateText(day,language)}, ${count} ${t('registreringer','entries')}`}><span>{new Intl.DateTimeFormat(language==='nb'?'nb-NO':'en-GB',{weekday:'short'}).format(new Date(`${day}T12:00:00`))}</span><strong>{Number(day.slice(-2))}</strong><small>{count?`${count} ${t('planlagt','planned')}`:'—'}</small></button>;})}</div></section>
    {calendar&&<Modal title={t('Kalender','Calendar')} onClose={()=>setCalendar(false)}><div className="stack"><div className="section-heading"><h3>{new Intl.DateTimeFormat(language==='nb'?'nb-NO':'en-GB',{month:'long',year:'numeric'}).format(new Date(`${month}-15T12:00:00`))}</h3><div className="inline-actions"><button className="icon-button" aria-label={t('Forrige måned','Previous month')} onClick={()=>setMonth(shiftMonth(month,-1))}><ChevronLeft size={18}/></button><button className="icon-button" aria-label={t('Neste måned','Next month')} onClick={()=>setMonth(shiftMonth(month,1))}><ChevronRight size={18}/></button></div></div><div className="calendar-month-grid">{(language==='nb'?['Ma','Ti','On','To','Fr','Lø','Sø']:['Mo','Tu','We','Th','Fr','Sa','Su']).map((label,index)=><span key={index} className="calendar-week-label">{label}</span>)}{monthDays(month).map(day=>{const scheduled=data.protocols.filter(p=>plannedDose(p,day));const last=scheduled.some(p=>{const dose=plannedDose(p,day);return dose&&isLastScheduledDose(p,dose);});return <button key={day} className={`day-tile ${day===today?'is-today':''} ${!day.startsWith(month)?'month-outside':''} ${last?'is-last':''}`} onClick={()=>{setCalendar(false);setPreview(day);}} aria-label={`${dateText(day,language)}, ${scheduled.length} ${t('registreringer','entries')}`}><strong>{Number(day.slice(-2))}{last&&<Flag size={10}/>}</strong><span>{scheduled.length||'·'}</span></button>;})}</div></div></Modal>}
    {preview&&<Modal title={dateText(preview,language)} onClose={()=>setPreview(null)}>{previews.length?<div className="daily-list preview-list">{previews.map(row=>rowView(row,false))}</div>:<EmptyState title={t('Ingen planlagte registreringer','No scheduled entries')} description={t('Denne dagen er tom i planen din.','There are no scheduled entries for this day.')}/>}</Modal>}
    {details&&<DoseDetails {...{data,update,language}} row={details} onClose={()=>setDetails(null)}/>}
  </div>;
}

function DoseDetails({data,update,language,row,onClose}:ViewProps&{row:DoseRow;onClose:()=>void}) {
  const {protocol,dose}=row;const existing=data.logs.find(log=>log.protocolId===protocol.id&&log.day===dose.day);
  const t=(nb:string,en:string)=>language==='nb'?nb:en;
  const [baseline]=useState(existing);
  const [amount,setAmount]=useState(String(existing?.amount??dose.amount));const [note,setNote]=useState(existing?.note??'');const [vialId,setVialId]=useState(existing?(existing.vialId??''):(protocol.vialId??''));const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const unit=existing?.unit??dose.unit;
  const info=doseContainer(data,protocol,Number(amount.replace(',','.')),unit,dose.day,vialId,existing?.id);
  const peptide=data.peptides.find(item=>item.id===protocol.peptideId);
  const components=peptide?.components?.length&&info&&unit==='units'?blendPerDose(peptide.components,info.vial.volumeML,Number(amount.replace(',','.'))):null;
  async function save(status:'taken'|'skipped') {
    const entered=Number(amount.replace(',','.'));if(!Number.isFinite(entered)||entered<=0){setError(t('Skriv inn en gyldig mengde.','Enter a valid amount.'));return;}
    setBusy(true);setError('');
    try{await update((current:AppData)=>{
      if(!current.protocols.some(item=>item.id===protocol.id))throw new Error(t('Planen er endret. Åpne den på nytt.','The plan changed. Reopen it.'));
      const currentLog=current.logs.find(log=>log.protocolId===protocol.id&&log.day===dose.day);
      if((baseline&&!currentLog)||(currentLog&&currentLog.id!==baseline?.id)||(baseline&&currentLog&&JSON.stringify(baseline)!==JSON.stringify(currentLog)))throw new Error(t('Registreringen er endret i et annet vindu. Åpne den på nytt.','The entry changed in another window. Reopen it.'));
      if(vialId&&!current.vials.some(vial=>vial.id===vialId&&vial.peptideId===protocol.peptideId))throw new Error(t('Beholderen finnes ikke lenger. Velg på nytt.','The container is no longer available. Choose again.'));
      const log:InjectionLog={id:existing?.id??uid(),protocolId:protocol.id,day:dose.day,amount:entered,unit,status,timestamp:existing?.timestamp??new Date().toISOString(),note,...(vialId?{vialId}:{})};
      return {...current,logs:[...current.logs.filter(item=>!(item.protocolId===protocol.id&&item.day===dose.day)),log]};
    });onClose();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <Modal title={t('Detaljer og registrering','Details & entry')} onClose={onClose}><form className="stack" onSubmit={event=>{event.preventDefault();void save('taken');}}><div><h3>{peptide?.name||protocol.name}</h3><p className="muted">{dateText(dose.day,language)} · {timeText(protocol.reminderMinuteOfDay)}</p></div><Field label={`${t('Mengde','Amount')} (${unitLabel(unit,language)})`}><input required inputMode="decimal" type="number" min="0.000001" step="any" value={amount} onChange={event=>setAmount(event.target.value)}/></Field><Field label={t('Beholder (valgfritt)','Container (optional)')}><select value={vialId} onChange={event=>setVialId(event.target.value)}><option value="">{t('Ingen koblet beholder','No linked container')}</option>{data.vials.filter(v=>v.peptideId===protocol.peptideId).map(vial=><option key={vial.id} value={vial.id}>{vial.kind==='pen'?t('Penn','Pen'):t('Glass','Vial')} · {numberText(vial.amount,language)} {unitLabel(vial.unit,language)} / {numberText(vial.volumeML,language)} ml</option>)}</select></Field>{info?.calculation&&<p className="info-note">{drawHint({calculation:info.calculation,clicks:info.clicks},language)}</p>}{components&&<p className="muted">{components.map(c=>`${c.name}: ${numberText(c.amount,language)} ${unitLabel(c.unit,language)}`).join(' · ')}</p>}{info&&(info.expired||info.futurePrepared||info.insufficient||info.incompatible)&&<p className="notice">{info.expired?t('Beholderen har passert utløpsdato.','This container is past its expiry date.'):info.futurePrepared?t('Klargjøringsdato ligger frem i tid.','Preparation date is in the future.'):info.incompatible?t('Enhetene gir ingen volumkonvertering.','These units cannot be converted to volume.'):t('Registrert restinnhold er lavere enn denne mengden.','Recorded remaining content is below this amount.')}</p>}<Field label={t('Notat (valgfritt)','Note (optional)')}><textarea value={note} maxLength={4000} onChange={event=>setNote(event.target.value)}/></Field>{error&&<p role="alert" className="error">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>void save('skipped')}><SkipForward size={16}/>{t('Hoppet over','Skipped')}</button><button type="submit" className="button primary" disabled={busy}><Check size={16}/>{existing?t('Lagre som tatt','Save as taken'):t('Logg som tatt','Log as taken')}</button></div></form></Modal>;
}
function shiftMonth(month:string,offset:number):string {const [year,m]=month.split('-').map(Number);const date=new Date(Date.UTC(year,m-1+offset,15));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;}
function monthDays(month:string):string[] {const first=`${month}-01`;const weekday=(new Date(`${first}T12:00:00Z`).getUTCDay()+6)%7;const next=`${shiftMonth(month,1)}-01`;const last=addDays(next,-1);const days=Number(last.slice(-2));const count=Math.ceil((weekday+days)/7)*7;return Array.from({length:count},(_,i)=>addDays(first,i-weekday));}
