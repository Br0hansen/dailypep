import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Layers3, Package, CalendarDays } from 'lucide-react';
import type { AppData, CycleItem, DosePhase, DoseUnit, Protocol, SavedCycle, ScheduleRule } from '../core/types';
import { addDays, dayIndex, isDay, plannedDoses, todayDay } from '../core/schedule';
import { catalog, searchCatalog } from '../core/catalog';
import { VialEditor } from './PeptidesView';
import { blendDrafts, buildBlendComponents, mergeBlendComponents, type ComponentDraft } from './planBlend';
import { Avatar, Field, Modal, RuleFields, UnitSelect, colors, dateText, numberText, positive, ruleText, uid, unitLabel, type ViewProps } from './shared';

type PhaseDraft = { id:string; amount:string; unit:DoseUnit; duration:string };
type PlanRow = { id:string; protocolId?:string; peptideId?:string; name:string; color:string; amount:string; unit:DoseUnit; phases:PhaseDraft[]; rule:ScheduleRule; startDay:string; endDay:string; time:string; vialId:string; isActive:boolean; components:ComponentDraft[] };
interface PlanWizardProps extends ViewProps { protocols?:Protocol[]; template?:SavedCycle; templateOnly?:boolean; onClose:()=>void; onSaved?:(message:string)=>void }
const timeText=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const newRow=():PlanRow=>({id:uid(),name:'',color:colors[0],amount:'',unit:'mg',phases:[],rule:{kind:'interval',days:1},startDay:todayDay(),endDay:'',time:'08:00',vialId:'',isActive:true,components:[]});
const normalize=(value:string)=>value.trim().toLocaleLowerCase();
function fromProtocol(protocol:Protocol,data:AppData):PlanRow {
  const peptide=data.peptides.find(p=>p.id===protocol.peptideId);
  return {...newRow(),protocolId:protocol.id,peptideId:protocol.peptideId,name:peptide?.name??protocol.name,color:peptide?.color??colors[0],components:blendDrafts(peptide?.name??protocol.name,peptide?.components),amount:String(protocol.phases[0]?.amount??''),unit:protocol.phases[0]?.unit??'mg',phases:protocol.phases.length>1||protocol.phases[0]?.durationDays!==null?protocol.phases.map(p=>({id:p.id,amount:String(p.amount),unit:p.unit,duration:p.durationDays===null?'':String(p.durationDays)})):[],rule:protocol.rule,startDay:protocol.startDay,endDay:protocol.endDay??'',time:timeText(protocol.reminderMinuteOfDay),vialId:protocol.vialId??'',isActive:protocol.isActive};
}
function fromTemplate(item:CycleItem,data:AppData):PlanRow {
  const peptide=data.peptides.find(p=>normalize(p.name)===normalize(item.peptideName));
  const duration='durationDays' in item?item.durationDays:item.weeks*7;
  const startDay=addDays(todayDay(),item.startOffsetDays??0);
  return {...newRow(),startDay,name:item.peptideName,peptideId:peptide?.id,color:peptide?.color??item.color,components:blendDrafts(item.peptideName,peptide?.components,item.components),amount:String(item.amount),unit:item.unit,phases:item.phases.length>1||item.phases[0]?.durationDays!==null?item.phases.map(p=>({id:uid(),amount:String(p.amount),unit:p.unit,duration:p.durationDays===null?'':String(p.durationDays)})):[],rule:item.rule,endDay:duration?addDays(startDay,duration-1):''};
}
function validRule(rule:ScheduleRule):boolean {
  if(rule.kind==='interval')return Number.isSafeInteger(rule.days)&&rule.days>0&&rule.days<=3650;
  if(rule.kind==='weekdays')return rule.days.length>0;
  return Number.isSafeInteger(rule.daysOn)&&rule.daysOn>0&&rule.daysOn<=3650&&Number.isSafeInteger(rule.daysOff)&&rule.daysOff>=0&&rule.daysOff<=3650;
}
function builtPhases(row:PlanRow):DosePhase[] {
  return row.phases.length?row.phases.map(p=>({id:p.id,amount:positive(p.amount)??0,unit:p.unit,durationDays:p.duration?Number(p.duration):null})):[{id:row.id,amount:positive(row.amount)??0,unit:row.unit,durationDays:null}];
}

export function PlanWizard({data,update,language,protocols,template,templateOnly=false,onClose,onSaved}:PlanWizardProps) {
  const t=(nb:string,en:string)=>language==='nb'?nb:en;
  const editing=Boolean(protocols?.length);
  const [step,setStep]=useState(0);
  const [name,setName]=useState(protocols?.[0]?.planName??protocols?.[0]?.name??template?.name??'');
  const [rows,setRows]=useState<PlanRow[]>(()=>protocols?.length?protocols.map(p=>fromProtocol(p,data)):template?template.items.map(item=>fromTemplate(item,data)):[newRow()]);
  const [saveTemplate,setSaveTemplate]=useState(templateOnly);
  const [creatingVialFor,setCreatingVialFor]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const patch=(id:string,value:Partial<PlanRow>)=>setRows(current=>current.map(row=>row.id===id?{...row,...value}:row));
  const labels=[t('Navn og innhold','Name & contents'),t('Din mengde','Your amount'),t('Dager og tid','Days & time'),t('Se gjennom','Review')];
  function validate(upTo:number):string|null {
    if(!name.trim()||rows.length===0||rows.some(row=>!row.name.trim()))return t('Gi planen et navn og legg til minst ett peptid.','Name your plan and add at least one peptide.');
    if(upTo>=1){
      for(const row of rows){
        const phases=builtPhases(row);
        if(phases.some((phase,index)=>phase.amount<=0||!Number.isFinite(phase.amount)||(phase.durationDays!==null&&(!Number.isSafeInteger(phase.durationDays)||phase.durationDays<1||phase.durationDays>36500))||(phase.durationDays===null&&index!==phases.length-1)))return t(`Kontroller mengde og fasevarighet for «${row.name}».`,`Check amount and phase duration for “${row.name}”.`);
        if(row.components.length){
          if(phases.some(p=>p.unit!=='units'))return t(`«${row.name}» er en blend. Bruk E (U-100) i alle fasene.`,`“${row.name}” is a blend. Use units (U-100) for every phase.`);
          try{buildBlendComponents(row.components);}catch{return t(`Fyll inn innholdet for alle komponentene i «${row.name}».`,`Enter the container content for every component in “${row.name}”.`);}
        }
      }
    }
    if(upTo>=2&&rows.some(row=>!validRule(row.rule)||!isDay(row.startDay)||(row.endDay&&(!isDay(row.endDay)||row.endDay<row.startDay))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)))return t('Kontroller datoer, frekvens og tidspunkt.','Check dates, frequency and time.');
    return null;
  }
  function advance(event:FormEvent){event.preventDefault();const issue=validate(step);setError(issue??'');if(!issue)setStep(value=>Math.min(3,value+1));}
  async function submit(start:boolean){
    const issue=validate(3);if(issue){setError(issue);return;}setBusy(true);setError('');
    try{
      const planId=protocols?.[0]?.planId??protocols?.[0]?.id??uid();
      await update(current=>{
        const peptides=[...current.peptides];
        const built:Protocol[]=rows.map(row=>{
          let peptide=peptides.find(p=>p.id===row.peptideId)||peptides.find(p=>normalize(p.name)===normalize(row.name));
          if(!peptide){peptide={id:uid(),name:row.name.trim(),color:row.color,notes:'',...(row.components.length?{components:buildBlendComponents(row.components)}:{})};peptides.push(peptide);}
          else if(row.components.length){const components=mergeBlendComponents(peptide.components,row.components);peptide={...peptide,components};peptides[peptides.findIndex(p=>p.id===peptide!.id)]=peptide;}
          const [hour,minute]=row.time.split(':').map(Number);
          const original=row.protocolId?current.protocols.find(p=>p.id===row.protocolId):undefined;
          if(row.protocolId&&!original)throw new Error(t('Planen ble endret i et annet vindu. Åpne den på nytt.','This plan changed in another window. Open it again.'));
          const vial=row.vialId?current.vials.find(v=>v.id===row.vialId&&v.peptideId===peptide!.id):undefined;
          if(row.vialId&&!vial)throw new Error(t('Den valgte beholderen finnes ikke lenger. Velg beholder på nytt.','The selected container no longer exists. Choose it again.'));
          return {id:original?.id??uid(),peptideId:peptide.id,name:name.trim(),planId,planName:name.trim(),startDay:row.startDay,endDay:row.endDay||null,rule:row.rule,phases:builtPhases(row),reminderMinuteOfDay:hour*60+minute,isActive:editing?row.isActive:true,...(vial?{vialId:vial.id}:{})};
        });
        let cycles=current.cycles;
        if(saveTemplate||!start){
          const firstDay=rows.reduce((day,row)=>row.startDay<day?row.startDay:day,rows[0].startDay);
          const items:CycleItem[]=rows.map(row=>{const duration=row.endDay?dayIndex(row.endDay,row.startDay)+1:null;return {id:uid(),peptideName:row.name.trim(),color:row.color,amount:builtPhases(row)[0].amount,unit:builtPhases(row)[0].unit,rule:row.rule,weeks:duration?Math.max(1,Math.ceil(duration/7)):1,durationDays:duration,startOffsetDays:dayIndex(row.startDay,firstDay),phases:builtPhases(row),...(row.components.length?{components:buildBlendComponents(row.components)}:{})};});
          const saved:SavedCycle={id:templateOnly&&template?template.id:uid(),name:name.trim(),items,lastStartedAt:start?new Date().toISOString():(templateOnly&&template?current.cycles.find(c=>c.id===template.id)?.lastStartedAt??null:null)};
          cycles=templateOnly&&template?current.cycles.map(c=>c.id===template.id?saved:c):[...current.cycles,saved];
        }
        if(!start)return {...current,cycles};
        const replaced=new Set(built.map(protocol=>protocol.id));
        const removed=new Set((protocols??[]).filter(protocol=>!replaced.has(protocol.id)).map(protocol=>protocol.id));
        return {...current,peptides,cycles,protocols:[...current.protocols.filter(protocol=>!replaced.has(protocol.id)).map(protocol=>removed.has(protocol.id)?{...protocol,isActive:false}:protocol),...built]};
      });
      onSaved?.(start?(editing?t('Planen er oppdatert.','Plan updated.'):t('Planen er startet. Du finner registreringene under I dag.','Plan started. Your entries are in Today.')):t('Malen er lagret. Ingen registreringer er aktivert.','Template saved. No entries have been activated.'));onClose();
    }catch(e){setError(e instanceof Error&&e.message==='BLEND_COMPONENTS_CHANGED'?t('Komponentinnholdet er endret i et annet vindu. Lukk og åpne planen på nytt før du lagrer.','Component content changed in another window. Close and reopen this plan before saving.'):e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  const choosePeptide=(row:PlanRow,value:string)=>{
    const peptide=data.peptides.find(p=>normalize(p.name)===normalize(value));
    const entry=catalog.find(c=>normalize(c.name)===normalize(value));
    patch(row.id,{name:value,components:blendDrafts(value,peptide?.components),peptideId:peptide?.id,color:peptide?.color??row.color,vialId:peptide?.id===row.peptideId?row.vialId:'',unit:peptide?.components?.length||entry?.componentNames.length?'units':row.unit});
  };
  return <><Modal title={editing?t('Rediger plan','Edit plan'):templateOnly?t('Rediger mal','Edit template'):t('Legg til plan','Add plan')} onClose={()=>!busy&&onClose()}>
    <ol className="plan-stepper" aria-label={t('Oppsett av plan','Plan setup')}>{labels.map((label,index)=><li key={label} className={index===step?'current':index<step?'complete':''} aria-current={index===step?'step':undefined}><span>{index<step?<Check size={13}/>:index+1}</span><small>{label}</small></li>)}</ol>
    <form className="stack plan-wizard" onSubmit={step<3?advance:event=>{event.preventDefault();void submit(!templateOnly);}}>
      <div className="wizard-heading"><h3>{labels[step]}</h3><p className="muted">{step===0?t('Samle ett eller flere peptider i én plan.','Bring one or more peptides together in one plan.'):step===1?t('Legg inn mengdene du selv har valgt.','Enter the amounts you have chosen.'):step===2?t('Velg når hver del av planen gjelder.','Choose when each part of your plan applies.'):t('Kontroller opplysningene før du lagrer.','Check your details before saving.')}</p></div>
      {step===0&&<><Field label={t('Navn på planen','Plan name')}><input required autoFocus maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder={t('Gi planen et navn','Give your plan a name')}/></Field>{rows.map((row,index)=><section className="plan-wizard-item stack" key={row.id}><div className="section-heading"><span className="muted">{t('Peptid','Peptide')} {index+1}</span>{rows.length>1&&<button type="button" className="icon-button" aria-label={t('Fjern peptid','Remove peptide')} onClick={()=>setRows(current=>current.filter(r=>r.id!==row.id))}><Trash2 size={16}/></button>}</div><Field label={t('Peptidnavn','Peptide name')}><input required list="plan-peptides" value={row.name} maxLength={120} onChange={e=>choosePeptide(row,e.target.value)} readOnly={Boolean(row.protocolId)}/></Field>{row.name.trim()&&!row.protocolId&&!data.peptides.some(p=>normalize(p.name)===normalize(row.name))&&<small className="muted">{t('Legges til automatisk når du starter planen.','Added automatically when you start the plan.')}</small>}</section>)}<datalist id="plan-peptides">{[...new Set([...data.peptides.map(p=>p.name),...searchCatalog('').map(p=>p.name)])].map(value=><option key={value} value={value}/>)}</datalist><button type="button" className="button secondary" onClick={()=>setRows(current=>[...current,{...newRow(),color:colors[current.length%colors.length]}])}><Plus size={16}/>{t('Legg til et peptid','Add another peptide')}</button></>}
      {step===1&&rows.map(row=><section className="plan-wizard-item stack" key={row.id}><div className="row-main"><Avatar name={row.name} color={row.color}/><h3>{row.name}</h3></div>{row.components.length>0&&<div className="blend-setup stack"><div><h4>{t('Innhold i én beholder','Content in one container')}</h4><p className="muted">{t('Fyll inn mengden av hver komponent fra din egen etikett. Dette er totalt innhold, ikke mengden per registrering.','Enter each component amount from your own label. This is the total content, not the amount per entry.')}</p></div>{row.components.map((component,index)=><div className="form-grid" key={component.name}><Field label={component.name}><input required readOnly={component.locked} inputMode="decimal" type="number" min="0.000001" step="any" value={component.amount} onChange={e=>patch(row.id,{components:row.components.map((c,i)=>i===index?{...c,amount:e.target.value}:c)})}/></Field><Field label={t('Enhet','Unit')}><select value={component.unit} disabled={component.locked} onChange={e=>patch(row.id,{components:row.components.map((c,i)=>i===index?{...c,unit:e.target.value as ComponentDraft['unit']}:c)})}>{(['mg','mcg','iu'] as const).map(unit=><option value={unit} key={unit}>{unitLabel(unit,language)}</option>)}</select></Field></div>)}{row.components.some(component=>component.locked)&&<small className="muted">{t('Tidligere lagret komponentinnhold beholdes.','Previously saved component content is kept.')}</small>}</div>}{!row.phases.length?<div className="form-grid"><Field label={t('Din mengde per registrering','Your amount per entry')}><input required inputMode="decimal" type="number" min="0.000001" step="any" value={row.amount} onChange={e=>patch(row.id,{amount:e.target.value})}/></Field><Field label={t('Enhet','Unit')}><UnitSelect value={row.unit} language={language} onChange={unit=>patch(row.id,{unit})}/></Field></div>:<>{row.phases.map((phase,index)=><div className="phase-row stack" key={phase.id}><strong>{t('Fase','Phase')} {index+1}</strong><div className="form-grid"><Field label={t('Mengde','Amount')}><input required inputMode="decimal" type="number" min="0.000001" step="any" value={phase.amount} onChange={e=>patch(row.id,{phases:row.phases.map(p=>p.id===phase.id?{...p,amount:e.target.value}:p)})}/></Field><Field label={t('Enhet','Unit')}><UnitSelect value={phase.unit} language={language} onChange={unit=>patch(row.id,{phases:row.phases.map(p=>p.id===phase.id?{...p,unit}:p)})}/></Field><Field label={t('Varighet i dager (tomt = resten)','Days (empty = remainder)')}><input required={index<row.phases.length-1} type="number" min="1" max="36500" step="1" value={phase.duration} onChange={e=>patch(row.id,{phases:row.phases.map(p=>p.id===phase.id?{...p,duration:e.target.value}:p)})}/></Field></div>{row.phases.length>1&&<button type="button" className="text-button" onClick={()=>patch(row.id,{phases:row.phases.filter(p=>p.id!==phase.id)})}>{t('Fjern fase','Remove phase')}</button>}</div>)}<button type="button" className="button secondary" onClick={()=>patch(row.id,{phases:[...row.phases.map(p=>({...p,duration:p.duration})),{id:uid(),amount:'',unit:row.unit,duration:''}]})}><Plus size={15}/>{t('Legg til fase','Add phase')}</button></>}
        <details className="advanced-options"><summary>{t('Flere valg','More options')}</summary><div className="stack">{!row.phases.length&&<button type="button" className="button secondary" onClick={()=>patch(row.id,{phases:[{id:uid(),amount:row.amount,unit:row.unit,duration:''}]})}><Layers3 size={15}/>{t('Bruk egne mengdefaser','Use your own amount phases')}</button>}
          <Field label={t('Koble til beholder (valgfritt)','Link a container (optional)')}><select value={row.vialId} onChange={e=>patch(row.id,{vialId:e.target.value})}><option value="">{t('Legg til senere','Add later')}</option>{data.vials.filter(v=>v.peptideId===(row.peptideId??data.peptides.find(p=>normalize(p.name)===normalize(row.name))?.id)).map(v=><option key={v.id} value={v.id}>{v.kind==='pen'?t('Penn','Pen'):t('Glass','Vial')} · {numberText(v.amount,language)} {unitLabel(v.unit,language)} / {numberText(v.volumeML,language)} ml</option>)}</select></Field>{data.peptides.some(p=>p.id===row.peptideId||normalize(p.name)===normalize(row.name))&&<button type="button" className="button secondary" onClick={()=>setCreatingVialFor(row.id)}><Plus size={14}/>{t('Legg til beholder nå','Add container now')}</button>}<small className="muted">{t('Du kan også koble til en beholder senere ved å redigere planen.','You can also link a container later by editing the plan.')}</small></div></details></section>)}
      {step===2&&rows.map(row=><section className="plan-wizard-item stack" key={row.id}><div className="row-main"><Avatar name={row.name} color={row.color}/><h3>{row.name}</h3></div><RuleFields value={row.rule} onChange={rule=>patch(row.id,{rule})} language={language}/><div className="form-grid"><Field label={t('Startdato','Start date')}><input required type="date" value={row.startDay} onChange={e=>patch(row.id,{startDay:e.target.value})}/></Field><Field label={t('Tidspunkt','Time')}><input required type="time" value={row.time} onChange={e=>patch(row.id,{time:e.target.value})}/></Field></div><details className="advanced-options" open={Boolean(row.endDay)}><summary>{t('Sluttdato (valgfritt)','End date (optional)')}</summary><Field label={t('Siste dag i planen','Last day of plan')}><input type="date" min={row.startDay} value={row.endDay} onChange={e=>patch(row.id,{endDay:e.target.value})}/></Field></details><small className="muted">{t('Tidspunktet vises i planen. Pushvarsler er ikke aktivert.','The time appears in your plan. Push reminders are not enabled.')}</small></section>)}
      {step===3&&<><div className="plan-review-title"><CalendarDays size={22}/><h3>{name}</h3></div>{rows.map(row=>{const phases=builtPhases(row);const protocol:Protocol={id:row.id,peptideId:row.peptideId??'',name:row.name,startDay:row.startDay,endDay:row.endDay||null,rule:row.rule,phases,reminderMinuteOfDay:0,isActive:true};const count=plannedDoses(protocol,row.startDay,addDays(row.startDay,6)).length;return <article className="plan-review-item" key={row.id}><div className="row-main"><Avatar name={row.name} color={row.color}/><div><h3>{row.name}</h3><p className="muted">{ruleText(row.rule,language)} · {row.time}</p></div></div><div className="review-values"><strong>{numberText(phases[0].amount,language)} {unitLabel(phases[0].unit,language)}{phases.length>1?` · ${phases.length} ${t('faser','phases')}`:''}</strong><span>{dateText(row.startDay,language)}{row.endDay?` – ${dateText(row.endDay,language)}`:` · ${t('uten sluttdato','no end date')}`}</span><small>{count} {t('planlagte registreringer første 7 dager','scheduled entries in the first 7 days')}</small>{row.components.length>0&&<small>{t('Innhold per beholder','Content per container')}: {buildBlendComponents(row.components).map(component=>`${component.name}: ${numberText(component.amount,language)} ${unitLabel(component.unit,language)}`).join(' · ')}</small>}{row.vialId&&<small><Package size={12}/> {t('Beholder er koblet til','Container linked')}</small>}</div></article>;})}
        {!templateOnly&&<label className="toggle-row"><input type="checkbox" checked={saveTemplate} onChange={e=>setSaveTemplate(e.target.checked)}/><span>{t('Lagre også som gjenbrukbar mal','Also save as a reusable template')}</span></label>}
        {editing&&<small className="muted">{t('Eksisterende logger beholdes. Endringer i planen gjelder kalenderen; fjernede deler settes på pause.','Existing logs are kept. Changes apply to the calendar; removed items are paused.')}</small>}</>}
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="wizard-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>step===0?onClose():(setError(''),setStep(current=>current-1))}><ArrowLeft size={16}/>{step===0?t('Avbryt','Cancel'):t('Tilbake','Back')}</button><div className="button-row">{step===3&&!editing&&!templateOnly&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void submit(false)}>{t('Lagre kun mal','Save template only')}</button>}<button type="submit" className="button primary" disabled={busy}>{step<3?t('Neste','Next'):busy?t('Lagrer…','Saving…'):templateOnly?t('Lagre mal','Save template'):editing?t('Lagre endringer','Save changes'):t('Bekreft og start plan','Confirm & start plan')}{step<3?<ArrowRight size={16}/>:<Check size={16}/>}</button></div></div>
    </form>
  </Modal>{creatingVialFor&&(()=>{const row=rows.find(r=>r.id===creatingVialFor);const peptide=data.peptides.find(p=>p.id===row?.peptideId||normalize(p.name)===normalize(row?.name??''));return peptide?<VialEditor {...{data,update,language}} peptide={peptide} onClose={()=>setCreatingVialFor(null)}/>:null;})()}</>;
}
