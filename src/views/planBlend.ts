import type { BlendComponent, DoseUnit } from '../core/types';
import { catalog } from '../core/catalog';

export interface ComponentDraft { name:string; amount:string; unit:Exclude<DoseUnit,'units'>; locked:boolean }
const normalized=(name:string)=>name.trim().toLocaleLowerCase();
const usable=(component:BlendComponent)=>Number.isFinite(component.amount)&&component.amount>0&&component.unit!=='units';

/** Only catalog names are seeded. Quantities come from existing user data or stay empty. */
export function blendDrafts(name:string,existing:BlendComponent[] = [],saved:BlendComponent[] = []):ComponentDraft[] {
  const entry=catalog.find(item=>normalized(item.name)===normalized(name));
  const names=[...new Set([...existing.map(component=>component.name),...(entry?.componentNames??[]),...saved.map(component=>component.name)])];
  return names.map(componentName=>{
    const current=existing.find(component=>normalized(component.name)===normalized(componentName));
    const stored=saved.find(component=>normalized(component.name)===normalized(componentName));
    const validCurrent=current&&usable(current)?current:undefined;
    const source=validCurrent??(stored&&usable(stored)?stored:undefined);
    return {name:componentName,amount:source?String(source.amount):'',unit:source&&source.unit!=='units'?source.unit:'mg',locked:Boolean(validCurrent)};
  });
}

export function buildBlendComponents(drafts:ComponentDraft[]):BlendComponent[] {
  return drafts.map(component=>{
    const amount=Number(component.amount.replace(',','.'));
    if(!component.name.trim()||!component.amount.trim()||!Number.isFinite(amount)||amount<=0||!['mg','mcg','iu'].includes(component.unit))throw new Error('INVALID_BLEND_COMPONENTS');
    return {name:component.name.trim(),amount,unit:component.unit};
  });
}

/** Never change an already populated component as a side effect of saving a plan. */
export function mergeBlendComponents(existing:BlendComponent[] = [],drafts:ComponentDraft[]):BlendComponent[] {
  const entered=buildBlendComponents(drafts);
  const merged=existing.map(component=>({...component}));
  for(const component of entered){
    const index=merged.findIndex(saved=>normalized(saved.name)===normalized(component.name));
    if(index<0)merged.push(component);
    else if(usable(merged[index])){
      if(merged[index].amount!==component.amount||merged[index].unit!==component.unit)throw new Error('BLEND_COMPONENTS_CHANGED');
    }else merged[index]=component;
  }
  return merged;
}
