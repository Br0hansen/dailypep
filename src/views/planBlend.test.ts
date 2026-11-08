import { describe,expect,it } from 'vitest';
import { blendDrafts,buildBlendComponents,mergeBlendComponents } from './planBlend';
import { catalog } from '../core/catalog';

describe('blend plan setup',()=>{
  const blend=catalog.find(item=>item.componentNames.length>0)!;
  it('starts with catalog names and empty amounts, never catalogue dosage guesses',()=>{
    const draft=blendDrafts(blend.name);
    expect(draft.map(component=>component.name)).toEqual(blend.componentNames);
    expect(draft.every(component=>component.amount===''&&!component.locked)).toBe(true);
    expect(()=>buildBlendComponents(draft)).toThrow('INVALID_BLEND_COMPONENTS');
  });
  it('retains user quantities from a template when there is no existing setup',()=>{
    const saved=blend.componentNames.map(name=>({name,amount:2,unit:'mg' as const}));
    expect(buildBlendComponents(blendDrafts(blend.name,[],saved))).toEqual(saved);
  });
  it('locks existing quantities and fills only missing components',()=>{
    const existing=[{name:blend.componentNames[0],amount:3,unit:'mg' as const}];
    const drafts=blendDrafts(blend.name,existing).map(component=>component.locked?component:{...component,amount:'5'});
    expect(drafts[0].locked).toBe(true);
    const merged=mergeBlendComponents(existing,drafts);
    expect(merged[0]).toEqual(existing[0]);
    expect(merged).toHaveLength(blend.componentNames.length);
    expect(existing).toHaveLength(1);
  });
  it('rejects a concurrent change instead of overwriting existing composition',()=>{
    const entered=[{name:'User component',amount:'2',unit:'mg' as const,locked:false}];
    expect(()=>mergeBlendComponents([{name:'User component',amount:4,unit:'mg'}],entered)).toThrow('BLEND_COMPONENTS_CHANGED');
  });
  it('rejects empty, zero and non-finite user values',()=>{
    for(const amount of ['', '0', '-1', 'Infinity'])expect(()=>buildBlendComponents([{name:'User component',amount,unit:'mg',locked:false}])).toThrow();
  });
});
