import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X, Plus, FlaskConical } from 'lucide-react';
import type { AppData, DoseUnit, ScheduleRule } from '../core/types';
export interface ViewProps { data: AppData; update: (updater: (data: AppData) => AppData) => Promise<void>; language: 'nb' | 'en' }
export const uid = () => crypto.randomUUID();
export const numberText = (value: number, language: 'nb' | 'en') => new Intl.NumberFormat(language === 'nb' ? 'nb-NO' : 'en-GB', { maximumFractionDigits: 4 }).format(value);
export const unitLabel = (unit: DoseUnit, language: 'nb' | 'en') => unit === 'iu' ? (language === 'nb' ? 'IE' : 'IU') : unit === 'units' ? (language === 'nb' ? 'E (U-100)' : 'units (U-100)') : unit;
export const dateText = (day: string, language: 'nb' | 'en') => new Intl.DateTimeFormat(language === 'nb' ? 'nb-NO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day}T12:00:00`));
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog className="modal" ref={ref} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-content"><header className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Close / Lukk" onClick={onClose}><X size={20}/></button></header>{children}</div></dialog>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
export function UnitSelect({ value, onChange, language }: { value: DoseUnit; onChange: (unit: DoseUnit) => void; language: 'nb'|'en' }) { return <select value={value} onChange={event => onChange(event.target.value as DoseUnit)}>{(['mg','mcg','iu','units'] as DoseUnit[]).map(unit => <option key={unit} value={unit}>{unitLabel(unit,language)}</option>)}</select>; }
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon">{icon || <FlaskConical size={28}/>}</div><h3>{title}</h3><p className="muted">{description}</p>{action}</div>; }
export function Avatar({ name, color }: { name: string; color: string }) { return <span className="peptide-avatar" style={{ backgroundColor: `${color}20`, color, borderColor: `${color}45` }}>{name.trim().slice(0,2).toUpperCase() || <Plus size={20}/>}</span>; }
export const colors = ['#59e0ba','#8da2fb','#e6b36d','#f587b0','#59c8ee','#be95ef'];
export function ruleText(rule: ScheduleRule, language: 'nb'|'en'): string {
  if (rule.kind === 'interval') return rule.days === 1 ? (language === 'nb' ? 'Daglig' : 'Daily') : language === 'nb' ? `Hver ${rule.days}. dag` : `Every ${rule.days} days`;
  if (rule.kind === 'cycle') return language === 'nb' ? `${rule.daysOn} på / ${rule.daysOff} av` : `${rule.daysOn} on / ${rule.daysOff} off`;
  const labels = language === 'nb' ? ['Søn','Man','Tir','Ons','Tor','Fre','Lør'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return rule.days.map(day => labels[day]).join(', ');
}
export function RuleFields({ value, onChange, language }: { value: ScheduleRule; onChange: (value: ScheduleRule) => void; language: 'nb'|'en' }) {
  const t=(nb:string,en:string)=>language==='nb'?nb:en;
  return <><Field label={t('Frekvens','Frequency')}><select value={value.kind} onChange={event=>onChange(event.target.value==='interval'?{kind:'interval',days:1}:event.target.value==='weekdays'?{kind:'weekdays',days:[]}:{kind:'cycle',daysOn:1,daysOff:1})}><option value="interval">{t('Hver N. dag','Every N days')}</option><option value="weekdays">{t('Faste ukedager','Days of the week')}</option><option value="cycle">{t('Dager på / av','Days on / off')}</option></select></Field>{value.kind==='interval'&&<Field label={t('Antall dager mellom doser','Days between doses')}><input required type="number" min="1" max="3650" step="1" value={value.days||''} onChange={event=>onChange({...value,days:Number(event.target.value)})}/></Field>}{value.kind==='cycle'&&<div className="form-grid"><Field label={t('Dager på','Days on')}><input required type="number" min="1" max="3650" step="1" value={value.daysOn||''} onChange={event=>onChange({...value,daysOn:Number(event.target.value)})}/></Field><Field label={t('Dager av','Days off')}><input required type="number" min="0" max="3650" step="1" value={value.daysOff} onChange={event=>onChange({...value,daysOff:Number(event.target.value)})}/></Field></div>}{value.kind==='weekdays'&&<fieldset className="weekday-picker"><legend>{t('Velg dager','Choose days')}</legend>{[1,2,3,4,5,6,0].map(day=><label key={day}><input type="checkbox" checked={value.days.includes(day)} onChange={event=>onChange({...value,days:event.target.checked?[...value.days,day]:value.days.filter(d=>d!==day)})}/><span>{(language==='nb'?['Sø','Ma','Ti','On','To','Fr','Lø']:['Su','Mo','Tu','We','Th','Fr','Sa'])[day]}</span></label>)}</fieldset>}</>;
}
export function positive(value: string): number | null { const n = Number(value.replace(',','.')); return value.trim() && Number.isFinite(n) && n>0 ? n : null; }

/**
 * Text field with its own dropdown of matches (prefix matches first). Replaces <datalist>,
 * which iOS shows in the bar above the keyboard instead of under the field.
 */
export function SuggestInput({ value, onChange, options, placeholder, required, autoFocus, readOnly, maxLength = 120 }: { value: string; onChange: (value: string) => void; options: string[]; placeholder?: string; required?: boolean; autoFocus?: boolean; readOnly?: boolean; maxLength?: number }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const id = useId();
  const listboxId = `${id}-suggestions`;
  const term = value.trim().toLocaleLowerCase();
  const candidates = term && !readOnly ? [...new Set(options)].filter(o => o.toLocaleLowerCase().includes(term) && o.toLocaleLowerCase() !== term)
    .sort((a, b) => Number(!a.toLocaleLowerCase().startsWith(term)) - Number(!b.toLocaleLowerCase().startsWith(term))).slice(0, 8) : [];
  const matches = open ? candidates : [];
  useEffect(() => {
    if (!open || activeIndex >= candidates.length) setActiveIndex(-1);
  }, [activeIndex, candidates.length, open]);
  const pick = (option: string) => { onChange(option); setOpen(false); setActiveIndex(-1); };
  return <div className="suggest">
    <input value={value} required={required} autoFocus={autoFocus} readOnly={readOnly} maxLength={maxLength} placeholder={placeholder}
      autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} role="combobox" aria-haspopup="listbox"
      aria-expanded={matches.length > 0} aria-autocomplete="list" aria-controls={matches.length > 0 ? listboxId : undefined}
      aria-activedescendant={activeIndex >= 0 && matches[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
      onChange={event => { onChange(event.target.value); setOpen(true); setActiveIndex(-1); }} onFocus={() => setOpen(true)}
      onBlur={() => setTimeout(() => { setOpen(false); setActiveIndex(-1); }, 150)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' && candidates.length) {
          event.preventDefault(); setOpen(true); setActiveIndex(index => index < candidates.length - 1 ? index + 1 : 0);
        } else if (event.key === 'ArrowUp' && candidates.length) {
          event.preventDefault(); setOpen(true); setActiveIndex(index => index > 0 ? index - 1 : candidates.length - 1);
        } else if (event.key === 'Enter' && open && activeIndex >= 0 && candidates[activeIndex]) {
          event.preventDefault(); pick(candidates[activeIndex]);
        } else if (event.key === 'Escape' && open) {
          event.preventDefault(); setOpen(false); setActiveIndex(-1);
        }
      }}/>
    {matches.length > 0 && <ul id={listboxId} className="suggest-list" role="listbox">{matches.map((option, index) => <li
      id={`${id}-option-${index}`} key={option} role="option" aria-selected={activeIndex === index}
      className={`suggest-option ${activeIndex === index ? 'active' : ''}`}
      onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()}
      onPointerMove={() => setActiveIndex(index)} onClick={() => pick(option)}>{option}</li>)}</ul>}
  </div>;
}
