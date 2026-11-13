import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Activity, CalendarDays, Package, BookOpen, Calculator, Settings, ShieldCheck, WifiOff, ArrowUpRight, Download, Upload, Cloud, Mail, LogOut, Check, RefreshCw, Plus, ChevronRight } from 'lucide-react';
import { useAppStore } from './data/useAppStore';
import { cloudConfigured, getSession, onAuthChange, signIn, signOut, fetchCloudBackup, saveCloudBackup } from './data/cloud';
import { importData, exportData } from './data/validation';
import { TodayView, HistoryView, CalculatorView } from './views';
import { PlansView } from './views/PlansView';
import { InventoryView } from './views/InventoryView';
import { Modal } from './views/shared';
import { PushSettings } from './views/PushSettings';
import type { AppData } from './core/types';
import { copyLocalToEmptyAccount, inspectAccountTransition, preferredWorkspace, rememberWorkspace, summarizeRecords, type AccountTransition } from './data/accountTransition';
import { localScope, persistentStorageStatus, requestPersistentStorage, type PersistentStorageStatus } from './data/local';
import { disconnectPushOnSignOut, syncExistingPushReminders } from './data/push';

type Page = 'today' | 'plans' | 'inventory' | 'history' | 'tools';
const pages = [
  { id: 'today', nb: 'I dag', en: 'Today', icon: Activity },
  { id: 'plans', nb: 'Planer', en: 'Plans', icon: CalendarDays },
  { id: 'inventory', nb: 'Beholdning', en: 'Inventory', icon: Package },
  { id: 'history', nb: 'Journal', en: 'Journal', icon: BookOpen },
] as const;
type Appearance = 'system' | 'light' | 'dark';
function storedAppearance(): Appearance {
  try {
    const value = localStorage.getItem('dailypep-appearance');
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch { /* Preference only. The app stays dark when storage is blocked. */ }
  return 'dark';
}
function resolvedAppearance(appearance: Appearance, systemDark: boolean): 'light' | 'dark' {
  return appearance === 'system' ? (systemDark ? 'dark' : 'light') : appearance;
}
function pageFromHash(): Page {
  const key=window.location.hash.slice(1);
  if(key==='peptides')return 'inventory';
  if(key==='planner'||key==='plan')return 'plans';
  if(key==='calculator')return 'tools';
  return ['today','plans','inventory','history','tools'].includes(key)?key as Page:'today';
}
export default function App() {
  const [session,setSession]=useState<Session|null>(null);
  const [pendingAccount,setPendingAccount]=useState<{session:Session;transition:AccountTransition}|null>(null);
  const [authReady,setAuthReady]=useState(!cloudConfigured);
  const [authError,setAuthError]=useState('');
  const [page,setPage]=useState<Page>(pageFromHash);
  const [newPlanRequest,setNewPlanRequest]=useState(0);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [online,setOnline]=useState(navigator.onLine);
  const [applyUpdate,setApplyUpdate]=useState<(()=>Promise<void>)|null>(null);
  function navigate(next:Page){setPage(next);window.history.pushState(null,'',`#${next}`);window.scrollTo({top:0,behavior:'instant'});}
  function addPlan(){setNewPlanRequest(value=>value+1);navigate('plans');}
  useEffect(()=>{const change=()=>setPage(pageFromHash());window.addEventListener('popstate',change);window.addEventListener('hashchange',change);return()=>{window.removeEventListener('popstate',change);window.removeEventListener('hashchange',change);};},[]);
  useEffect(()=>{
    if(!cloudConfigured)return;
    let mounted=true;let authEvent=false;let request=0;
    const resolveSession=async(value:Session|null)=>{
      const token=++request;
      try{
        if(!value){
          if(mounted&&token===request){rememberWorkspace(null);setPendingAccount(null);setSession(null);setAuthReady(true);}
          return;
        }
        if(preferredWorkspace()===localScope(value.user.id)){
          if(mounted&&token===request){setPendingAccount(null);setSession(value);setAuthReady(true);}
          return;
        }
        const transition=await inspectAccountTransition(value.user.id);
        if(!mounted||token!==request)return;
        if(transition.local.total>0){
          setSettingsOpen(false);setSession(null);setPendingAccount({session:value,transition});setAuthReady(true);
        }else{
          rememberWorkspace(value.user.id);setPendingAccount(null);setSession(value);setAuthReady(true);
        }
      }catch(error){
        if(mounted&&token===request){setAuthError(error instanceof Error?error.message:String(error));setAuthReady(true);}
      }
    };
    const unsubscribe=onAuthChange(value=>{authEvent=true;void resolveSession(value);});
    getSession().then(value=>{if(mounted&&!authEvent)void resolveSession(value);}).catch(error=>{if(mounted){setAuthError(String(error));setAuthReady(true);}});
    return()=>{mounted=false;unsubscribe();};
  },[]);
  useEffect(()=>{
    const on=()=>setOnline(navigator.onLine);
    const updated=(event:WindowEventMap['dailypep:update-ready'])=>setApplyUpdate(()=>event.detail.update);
    window.addEventListener('online',on);window.addEventListener('offline',on);window.addEventListener('dailypep:update-ready',updated);
    return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',on);window.removeEventListener('dailypep:update-ready',updated);};
  },[]);
  if(!authReady)return <div className="boot-screen"><Activity size={36}/><h1>DailyPep</h1><p>Loading…</p></div>;
  const openAccount=()=>{if(!pendingAccount)return;rememberWorkspace(pendingAccount.session.user.id);setSession(pendingAccount.session);setPendingAccount(null);};
  const copyAndOpen=async()=>{if(!pendingAccount)return;await copyLocalToEmptyAccount(pendingAccount.transition);openAccount();};
  const stayLocal=async()=>{await disconnectPushOnSignOut(pendingAccount!.session.user.id);await signOut();rememberWorkspace(null);setPendingAccount(null);setSession(null);};
  return <><Workspace key={session?.user.id??'local'} {...{session,page,navigate,newPlanRequest,addPlan,consumeNewPlan:()=>setNewPlanRequest(0),settingsOpen,setSettingsOpen,online,authError,applyUpdate}}/>{pendingAccount&&<AccountTransitionDialog pending={pendingAccount} openAccount={openAccount} copyAndOpen={copyAndOpen} stayLocal={stayLocal}/>}</>;
}

function AccountTransitionDialog({pending,openAccount,copyAndOpen,stayLocal}:{pending:{session:Session;transition:AccountTransition};openAccount:()=>void;copyAndOpen:()=>Promise<void>;stayLocal:()=>Promise<void>}){
  const language=pending.transition.localData.settings.language;
  const t=(nb:string,en:string)=>language==='nb'?nb:en;
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const run=async(action:()=>void|Promise<void>)=>{setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const local=pending.transition.local;const account=pending.transition.account;
  const summary=(value:typeof local)=>t(`${value.total} oppføringer totalt: ${value.plans} planer, ${value.containers} beholdere, ${value.logs} logger og ${value.measurements} målinger`,`${value.total} records total: ${value.plans} plans, ${value.containers} containers, ${value.logs} logs and ${value.measurements} measurements`);
  return <Modal title={t('Velg hvilket datarom du vil åpne','Choose which workspace to open')} onClose={()=>void run(stayLocal)}><div className="stack"><p>{t('Du er logget inn, men den lokale profilen og kontoen lagrer data hver for seg. Ingenting flyttes eller slettes uten at du velger det.','You are signed in, but the local profile and account keep separate records. Nothing is moved or deleted unless you choose it.')}</p><div className="card"><h3>{t('Lokal profil','Local profile')}</h3><p className="muted">{summary(local)}</p></div><div className="card"><h3>{pending.session.user.email??t('Konto','Account')}</h3><p className="muted">{summary(account)}</p></div>{pending.transition.canCopyLocal?<p className="muted">{t('Kontoen er tom. Du kan kopiere de lokale dataene dit; originalen blir fortsatt liggende lokalt.','The account is empty. You can copy the local records into it; the original remains in the local profile.')}</p>:<p className="muted">{t('Begge datarom inneholder oppføringer. De slås ikke sammen automatisk. Åpne ett av dem og eksporter en kopi før du eventuelt erstatter data.','Both workspaces contain records. They are not merged automatically. Open one and export a copy before replacing anything.')}</p>}{error&&<p className="error-banner" role="alert">{error}</p>}<div className="button-row">{pending.transition.canCopyLocal&&<button className="primary" disabled={busy} onClick={()=>void run(copyAndOpen)}><Upload size={16}/>{t('Kopier lokalt til kontoen','Copy local data to account')}</button>}<button disabled={busy} onClick={openAccount}><Cloud size={16}/>{t('Åpne kontodata','Open account data')}</button><button className="secondary" disabled={busy} onClick={()=>void run(stayLocal)}>{t('Fortsett lokalt','Stay local')}</button></div></div></Modal>;
}
function Workspace({session,page,navigate,newPlanRequest,addPlan,consumeNewPlan,settingsOpen,setSettingsOpen,online,authError,applyUpdate}:{session:Session|null;page:Page;navigate:(page:Page)=>void;newPlanRequest:number;addPlan:()=>void;consumeNewPlan:()=>void;settingsOpen:boolean;setSettingsOpen:(value:boolean)=>void;online:boolean;authError:string;applyUpdate:(()=>Promise<void>)|null}){
  const {data,loading,error,update}=useAppStore(session?.user.id);
  const [inventoryFocusPeptide,setInventoryFocusPeptide]=useState<string|null>(null);
  const [guidanceDismissed,setGuidanceDismissed]=useState(()=>{try{return localStorage.getItem('dailypep-post-value-guidance-dismissed')==='1';}catch{return false;}});
  const [appearance,setAppearance]=useState<Appearance>(storedAppearance);
  const [systemDark,setSystemDark]=useState(()=>window.matchMedia('(prefers-color-scheme: dark)').matches);
  const language=data.settings.language;
  const t=(nb:string,en:string)=>language==='nb'?nb:en;
  const props={data,update,language};
  const selected=pages.find(item=>item.id===page);
  const title=selected?(language==='nb'?selected.nb:selected.en):t('Kalkulator','Calculator');
  const date=new Intl.DateTimeFormat(language==='nb'?'nb-NO':'en-GB',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const hasCreatedValue=summarizeRecords(data).total>0;
  const dismissGuidance=()=>{setGuidanceDismissed(true);try{localStorage.setItem('dailypep-post-value-guidance-dismissed','1');}catch{/* Dismissal only needs to last for this page load when storage is unavailable. */}};
  const mode=resolvedAppearance(appearance,systemDark);
  const showAdd=!loading&&!error&&((page==='today'&&data.protocols.length>0)||(page==='plans'&&(data.protocols.length>0||data.cycles.length>0)));
  useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)');const change=()=>setSystemDark(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  useEffect(()=>{
    document.documentElement.lang=language;
    document.documentElement.dataset.theme=data.settings.theme;
    document.documentElement.dataset.appearance=mode;
    document.documentElement.style.colorScheme=mode;
    const themeColor=mode==='light'?'#f2f2f7':'#000000';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',themeColor);
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content',mode==='light'?'default':'black-translucent');
    try{localStorage.setItem('dailypep-appearance',appearance);}catch{/* Preference only. */}
  },[language,data.settings.theme,appearance,mode]);
  useEffect(()=>{if(page!=='inventory')setInventoryFocusPeptide(null);},[page]);
  useEffect(()=>{
    if(!session||loading)return;
    let active=true;
    const sync=()=>{void syncExistingPushReminders(data,session.user.id).catch(reason=>{if(active)console.warn('DailyPep reminder sync failed:',reason);});};
    const timer=window.setTimeout(sync,750);
    window.addEventListener('online',sync);
    return()=>{active=false;window.clearTimeout(timer);window.removeEventListener('online',sync);};
  },[session?.user.id,loading,data.protocols,data.settings.language]);
  return <div className="app-shell electric-refined lumen">
    <a className="skip-link" href="#main">{t('Hopp til innhold','Skip to content')}</a>
    <aside className="sidebar">
      <a className="brand" href="#today" onClick={event=>{event.preventDefault();navigate('today');}}><span className="brand-mark" aria-hidden="true"/>DailyPep</a>
      <nav aria-label={t('Hovedmeny','Main navigation')}>{pages.map(({id,nb,en,icon:Icon})=><button key={id} onClick={()=>navigate(id)} className={`nav-item ${page===id?'active':''}`} aria-current={page===id?'page':undefined}><Icon size={20}/><span>{language==='nb'?nb:en}</span></button>)}<button className={`nav-item ${page==='tools'?'active':''}`} onClick={()=>navigate('tools')} aria-current={page==='tools'?'page':undefined}><Calculator size={20}/>{t('Kalkulator','Calculator')}</button></nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={()=>setSettingsOpen(true)}><Settings size={20}/>{t('Innstillinger','Settings')}</button></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar-inner"><div className="topbar-title">{page==='tools'&&<button className="text-button back-link" onClick={()=>navigate('today')}>{t('I dag','Today')}</button>}<h1>{title}</h1>{page==='today'&&<p className="date-label">{date}</p>}</div><div className="topbar-actions">{showAdd&&<button className="icon-button add-icon" onClick={addPlan} aria-label={t('Legg til plan','Add plan')}><Plus size={20}/></button>}<button className="icon-button" onClick={()=>setSettingsOpen(true)} aria-label={t('Innstillinger','Settings')}><Settings size={20}/></button></div></div></header>
      <main id="main">
        {!online&&<p className="notice offline-banner" role="status"><WifiOff size={15}/>{t('Frakoblet. Endringer lagres på enheten.','Offline. Changes stay on this device.')}</p>}
        {(error||authError)&&<p className="error-banner" role="alert">{error||authError}</p>}
        {applyUpdate&&<div className="notice">{t('En ny versjon er klar. Lagre åpne skjema før du oppdaterer.','An update is ready. Save open forms before refreshing.')}<button onClick={()=>void applyUpdate()}><RefreshCw size={14}/>{t('Oppdater','Update')}</button></div>}
        {page==='today'&&hasCreatedValue&&!guidanceDismissed&&<div className="notice post-value-guidance"><span>{t('Legg DailyPep på hjemskjermen, og ta vare på en kopi av viktige oppføringer.','Add DailyPep to your home screen, and keep a copy of important records.')}</span><div className="button-row"><button className="text-button" onClick={()=>setSettingsOpen(true)}><ShieldCheck size={14}/>{t('Innstillinger','Settings')}</button><button className="text-button" onClick={dismissGuidance}>{t('Skjul','Hide')}</button></div></div>}
        {loading
          ? <div className="empty-state"><Activity/><h2>{t('Henter oversikten din…','Opening your space…')}</h2></div>
          : page==='today'
            ? <TodayView {...props} onAddPlan={addPlan} onManageContainer={peptideId=>{setInventoryFocusPeptide(peptideId);navigate('inventory');}}/>
            : page==='plans'
              ? <PlansView {...props} openNew={newPlanRequest} onNewConsumed={consumeNewPlan} onOpenInventory={()=>navigate('inventory')}/>
              : page==='inventory'
                ? <InventoryView {...props} onAddPlan={()=>navigate('plans')} onOpenTools={()=>navigate('tools')} initialPeptideId={inventoryFocusPeptide}/>
                : page==='history' ? <HistoryView {...props}/> : <CalculatorView {...props}/>}
        <footer className="app-footer">{t('Dine egne registreringer. Ingen medisinske anbefalinger.','Your own records. No medical recommendations.')}</footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label={t('Hovedmeny','Main navigation')}>{pages.map(({id,nb,en,icon:Icon})=><button key={id} onClick={()=>navigate(id)} className={page===id?'active':''} aria-current={page===id?'page':undefined}><Icon size={22}/><span>{language==='nb'?nb:en}</span></button>)}</nav>
    {settingsOpen&&!loading&&!error&&<SettingsPanel data={data} update={update} session={session} close={()=>setSettingsOpen(false)} onTools={()=>navigate('tools')} appearance={appearance} setAppearance={setAppearance}/>}
  </div>;
}

function SettingsPanel({data,update,session,close,onTools,appearance,setAppearance}:{data:AppData;update:(fn:(d:AppData)=>AppData)=>Promise<void>;session:Session|null;close:()=>void;onTools:()=>void;appearance:Appearance;setAppearance:(value:Appearance)=>void}) {
  const t = (nb:string,en:string) => data.settings.language==='nb'?nb:en;
  const [email,setEmail]=useState(''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');
  const [revision,setRevision]=useState<number|null>(null); const [remote,setRemote]=useState<{data:AppData;revision:number;updatedAt:string}|null>(null); const [checked,setChecked]=useState(false);
  const [storageStatus,setStorageStatus]=useState<PersistentStorageStatus>('unsupported');
  const fileRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{let active=true;void persistentStorageStatus().then(value=>{if(active)setStorageStatus(value);});return()=>{active=false;};},[]);
  const action=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const download=()=>{const url=URL.createObjectURL(new Blob([exportData(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`dailypep-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const hasRecords=summarizeRecords(data).total>0;
  return <Modal title={t('Innstillinger','Settings')} onClose={close}>
    <div className="settings-section"><h3>{t('Verktøy','Tools')}</h3><button className="tool-link" onClick={()=>{close();onTools();}}><Calculator size={18}/><span><strong>{t('Kalkulator','Calculator')}</strong><small>{t('Uttrekk, væske og blend','Draw, liquid and blends')}</small></span><ChevronRight size={16}/></button></div>
    <div className="settings-section"><h3>{t('Utseende','Appearance')}</h3><div className="segmented-control" role="group" aria-label={t('Utseende','Appearance')}>{(['light','dark','system'] as const).map(value=><button type="button" key={value} className={appearance===value?'active':''} aria-pressed={appearance===value} onClick={()=>setAppearance(value)}>{value==='light'?t('Lys','Light'):value==='dark'?t('Mørk','Dark'):t('Auto','Auto')}</button>)}</div><span className="field-caption">{t('Aksent','Accent')}</span><div className="accent-picker" role="group" aria-label={t('Aksent','Accent')}><button type="button" aria-pressed={data.settings.theme==='electric'} disabled={busy} onClick={()=>void action(()=>update(d=>({...d,settings:{...d.settings,theme:'electric'}})))}><i className="accent-dot blue" aria-hidden="true"/>{t('Blå','Blue')}</button><button type="button" aria-pressed={data.settings.theme==='corall'} disabled={busy} onClick={()=>void action(()=>update(d=>({...d,settings:{...d.settings,theme:'corall'}})))}><i className="accent-dot rose" aria-hidden="true"/>{t('Rose','Rose')}</button></div><span className="field-caption">{t('Språk','Language')}</span><div className="segmented-control" role="group" aria-label={t('Språk','Language')}><button type="button" className={data.settings.language==='nb'?'active':''} aria-pressed={data.settings.language==='nb'} disabled={busy} onClick={()=>void action(()=>update(d=>({...d,settings:{...d.settings,language:'nb'}})))}>Norsk</button><button type="button" className={data.settings.language==='en'?'active':''} aria-pressed={data.settings.language==='en'} disabled={busy} onClick={()=>void action(()=>update(d=>({...d,settings:{...d.settings,language:'en'}})))}>English</button></div></div>
    <div className="settings-section"><h3><Download size={18}/>{t('Data og sikkerhetskopi','Data & backup')}</h3><p>{storageStatus==='granted'?t('Nettleseren har godkjent varig lokal lagring. Eksport er fortsatt den sikreste flyttbare kopien.','The browser has granted persistent local storage. An export is still the safest portable copy.'):storageStatus==='not-granted'?t('Data lagres lokalt, men enheten eller nettleseren kan rydde dem bort. Be om varig lagring og eksporter jevnlig.','Records are stored locally, but device or browser cleanup may remove them. Request persistent storage and export regularly.'):t('Denne nettleseren oppgir ikke om lokal lagring er varig. Eksporter viktige oppføringer jevnlig.','This browser does not report whether local storage is persistent. Export important records regularly.')}</p><div className="button-row">{storageStatus==='not-granted'&&<button disabled={busy} onClick={()=>void action(async()=>{const result=await requestPersistentStorage();setStorageStatus(result);setMessage(result==='granted'?t('Varig lokal lagring er godkjent.','Persistent local storage was granted.'):result==='not-granted'?t('Nettleseren ga ikke varig lagring. Bruk eksport for en flyttbar kopi.','The browser did not grant persistent storage. Use export for a portable copy.'):t('Nettleseren støtter ikke denne forespørselen.','This browser does not support this request.'));})}><ShieldCheck size={16}/>{t('Beskytt lokal lagring','Protect local storage')}</button>}<button onClick={download}><Download size={16}/>{t('Eksporter JSON','Export JSON')}</button><button onClick={()=>fileRef.current?.click()} disabled={busy}><Upload size={16}/>{t('Importer','Import')}</button></div><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;void action(async()=>{if(f.size>100*1024*1024)throw new Error(t('Filen er for stor (maks 100 MB).','File is too large (maximum 100 MB).'));const imported=importData(await f.text());if(hasRecords&&!window.confirm(t('Erstatt dataene på denne enheten? Eksporter en kopi først.','Replace records on this device? Export a copy first.')))return;await update(()=>imported);setMessage(t('Sikkerhetskopien er importert.','Backup imported.'));});}}/></div>
    <div className="settings-section"><h3><Cloud size={18}/>{t('Konto og skylagring','Account & cloud backup')}</h3>{!cloudConfigured?<p>{t('Supabase er ikke konfigurert. Lokal lagring og eksport fungerer som vanlig.','Supabase is not configured. Local saving and export are available.')}</p>:!session?<><p>{t('Logg inn med en lenke på e-post. Kontoen har et eget datalager; lokale data flyttes via eksport/import.','Sign in with an email link. Your account has separate records; transfer local records with export/import.')}</p><form onSubmit={e=>{e.preventDefault();void action(async()=>{await signIn(email);setMessage(t('Sjekk e-posten din for innloggingslenken.','Check your email for the sign-in link.'));});}}><label>{t('E-post','Email')}<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="primary" disabled={busy}><Mail size={16}/>{t('Send innloggingslenke','Send sign-in link')}</button></form></>:<><p className="account-email">{session.user.email}</p><p>{t('Sikkerhetskopiering er manuell. Se etter en nyere skyversjon før du lagrer.','Backups are manual. Check for a newer cloud copy before saving.')}</p><div className="button-row"><button disabled={busy} onClick={()=>void action(async()=>{const result=await fetchCloudBackup(session.user.id);setRemote(result);setRevision(result?.revision??0);setChecked(true);setMessage(result?t('Skykopi funnet. Velg hent eller lagre.','Cloud copy found. Choose restore or save.'):t('Ingen skykopi ennå. Du kan lagre den første nå.','No cloud copy yet. You can save your first backup.'));})}><RefreshCw size={16}/>{t('Sjekk skyen','Check cloud')}</button><button disabled={busy||!checked||revision===null} onClick={()=>void action(async()=>{if(remote&&!window.confirm(t('Erstatt skykopien med dataene på denne enheten?','Replace the cloud backup with records on this device?')))return;const rev=await saveCloudBackup(data,revision!,session.user.id);setRevision(rev);setRemote({data,revision:rev,updatedAt:new Date().toISOString()});setMessage(t('Sikkerhetskopi lagret i skyen.','Cloud backup saved.'));})}><Upload size={16}/>{t('Lagre i skyen','Back up to cloud')}</button>{remote&&<button disabled={busy} onClick={()=>void action(async()=>{if(hasRecords&&!window.confirm(t('Erstatt dataene på enheten med skykopien? Eksporter først.','Replace device records with the cloud backup? Export first.')))return;await update(()=>remote.data);setMessage(t('Skykopien er hentet.','Cloud backup restored.'));})}><Download size={16}/>{t('Hent skykopi','Restore cloud copy')}</button>}</div>{remote&&<small>{t('Skyversjon','Cloud revision')} {remote.revision} · {new Date(remote.updatedAt).toLocaleString()}</small>}<button className="text-button" disabled={busy} onClick={()=>void action(async()=>{await disconnectPushOnSignOut(session.user.id);await signOut();close();})}><LogOut size={15}/>{t('Logg ut','Sign out')}</button></> }</div>
    <PushSettings data={data} session={session}/>
    <div className="settings-section install-note"><h3><ArrowUpRight size={18}/>{t('På hjemskjermen','On your home screen')}</h3><ol className="install-steps"><li>{t('Åpne siden i Safari.','Open the page in Safari.')}</li><li>{t('Trykk Del, deretter Legg til på Hjem-skjerm.','Tap Share, then Add to Home Screen.')}</li><li>{t('Åpne DailyPep fra ikonet før du slår på varsler.','Open DailyPep from the icon before turning on reminders.')}</li></ol><p>{t('På PC og Android velger du Installer i nettleseren.','On desktop and Android, choose Install in the browser.')}</p><small>{t('iOS-widget er ikke tilgjengelig i nettversjonen.','The iOS widget is not available in the web version.')}</small></div>
    {busy&&<p role="status">{t('Jobber…','Working…')}</p>}{message&&<p className="success-banner" role="status"><Check size={16}/>{message}</p>}{error&&<p className="error-banner" role="alert">{error}</p>}
  </Modal>;
}
