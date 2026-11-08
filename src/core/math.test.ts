import { describe, expect, it } from 'vitest';
import { blendPerDose, calculateDose, convertDose, daysUntilEmpty, vialRemaining } from './math';
import { cycleNeeds, mergeNeeds } from './planner';
import { catalog, searchCatalog } from './catalog';
import type { InjectionLog, Protocol, Vial } from './types';
const p: Protocol = { id:'p',peptideId:'pep',name:'Own plan',startDay:'2026-01-01',endDay:null,rule:{kind:'interval',days:1},phases:[{id:'f',durationDays:null,amount:250,unit:'mcg'}],reminderMinuteOfDay:480,isActive:true };
describe('unit safety and concentration arithmetic', () => {
  it('converts mass units without inventing IU or volume-to-mass conversions', () => {
    expect(convertDose(1, 'mg', 'mcg')).toBe(1000);
    expect(convertDose(250, 'mcg', 'mg')).toBe(0.25);
    expect(convertDose(10, 'iu', 'mg')).toBeNull();
    expect(convertDose(10, 'units', 'iu')).toBeNull();
    expect(convertDose(Infinity, 'mg', 'mg')).toBeNull();
  });
  it('calculates user-entered quantities on the U-100 scale', () => {
    expect(calculateDose(10, 2, 0.25)).toEqual({ volumeML: 0.05, units: 5, doses: 40 });
    expect(calculateDose(5000, 2, 250)?.doses).toBe(20);
    expect(calculateDose(0, 2, 1)).toBeNull();
    expect(calculateDose(10, NaN, 1)).toBeNull();
  });
  it('computes each blend component from the entered vial fraction', () => {
    expect(blendPerDose([{ name:'Component',amount:10,unit:'mg' }], 2, 10))
      .toEqual([{ name:'Component',amount:0.5,unit:'mg' }]);
  });
  it('only deducts taken logs explicitly assigned to that vial', () => {
    const v:Vial={id:'v',peptideId:'pep',kind:'powder',amount:10,unit:'mg',volumeML:2,preparedAt:null,expiresAt:null};
    const log:InjectionLog={id:'l',protocolId:'p',day:'2026-01-01',amount:250,unit:'mcg',status:'taken',timestamp:'',note:'',vialId:'v'};
    expect(vialRemaining(v,[log,{...log,id:'skip',status:'skipped'},{...log,id:'other',vialId:'other'}])).toBe(9.75);
    expect(vialRemaining(v,[{...log,unit:'iu'}])).toBeNull();
  });
  it('forecasts only when units are compatible and horizon is sufficient', () => {
    expect(daysUntilEmpty(1,[p],'mg','2026-01-01')).toBe(3);
    expect(daysUntilEmpty(1,[p],'iu','2026-01-01')).toBeNull();
    expect(daysUntilEmpty(1,[p],'mg','2026-01-01',2)).toBeNull();
  });
});
describe('cycle totals', () => {
  it('normalizes mixed mass quantities while keeping IU separate', () => {
    expect(mergeNeeds([{name:'A',totalAmount:1,unit:'mg'},{name:'A',totalAmount:500,unit:'mcg'},{name:'A',totalAmount:2,unit:'iu'}]))
      .toEqual([{name:'A',totalAmount:2,unit:'iu'},{name:'A',totalAmount:1.5,unit:'mg'}]);
    expect(cycleNeeds('A',p,'2026-01-01','2026-01-04')).toEqual([{name:'A',totalAmount:1,unit:'mg'}]);
  });
  it('does not treat a blend mass dose as syringe units', () => {
    expect(cycleNeeds('Blend',p,'2026-01-01','2026-01-04',[{name:'A',amount:10,unit:'mg'}],2)).toEqual([]);
  });
});
describe('name-only catalog', () => {
  it('retains the complete source catalog and ranks prefix matches first', () => {
    expect(catalog.length).toBeGreaterThan(90);
    expect(searchCatalog(' bpc ')[0].name).toBe('BPC-157');
    expect(searchCatalog('')).toEqual(catalog);
    expect(catalog.every(entry => Object.keys(entry).every(key => ['name','defaultUnit','category','componentNames'].includes(key)))).toBe(true);
  });
});
