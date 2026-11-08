import { describe, expect, it } from 'vitest';
import { nextScheduledDose, recordScheduledDose, doseContainer, isLastScheduledDose } from './dailyActions';
import { emptyData } from '../data/validation';
import type { Protocol } from './types';
const protocol: Protocol = { id:'p',peptideId:'a',name:'Own plan',startDay:'2026-10-23',endDay:null,isActive:true,rule:{kind:'interval',days:3},phases:[{id:'f',amount:2,unit:'mg',durationDays:null}],reminderMinuteOfDay:480 };
describe('daily action schedule and logging',()=>{
  it('finds a next dose across daylight saving without moving the interval grid',()=>{
    expect(nextScheduledDose(protocol,'2026-10-24')?.day).toBe('2026-10-26');
    expect(nextScheduledDose(protocol,'2026-10-26')?.day).toBe('2026-10-26');
  });
  it('handles off-days, weekdays, paused plans and expired finite phases',()=>{
    expect(nextScheduledDose({...protocol,rule:{kind:'cycle',daysOn:2,daysOff:3}},'2026-10-25')?.day).toBe('2026-10-28');
    expect(nextScheduledDose({...protocol,rule:{kind:'weekdays',days:[1]}},'2026-10-24')?.day).toBe('2026-10-26');
    expect(nextScheduledDose({...protocol,isActive:false},'2026-10-24')).toBeNull();
    expect(nextScheduledDose({...protocol,phases:[{id:'f',amount:2,unit:'mg',durationDays:2}]},'2026-10-25')).toBeNull();
    expect(isLastScheduledDose({...protocol,phases:[{id:'f',amount:2,unit:'mg',durationDays:2}]},{protocolId:'p',day:'2026-10-23',amount:2,unit:'mg',phaseIndex:0})).toBe(true);
  });
  it('makes quick log idempotent and keeps the first actual record',()=>{
    const data={...emptyData(),peptides:[{id:'a',name:'Own entry',color:'#00ffcc',notes:''}],protocols:[protocol]};
    const first=recordScheduledDose(data,'p','2026-10-23','first','2026-10-23T08:00:00Z');
    expect(recordScheduledDose(first,'p','2026-10-23','second','2026-10-23T09:00:00Z')).toBe(first);
    expect(first.logs[0].id).toBe('first');
    expect(first.logs[0].vialId).toBeUndefined();
  });
  it('uses only explicitly linked containers and detects insufficient content',()=>{
    const data={...emptyData(),vials:[{id:'v',peptideId:'a',kind:'pen' as const,amount:1,unit:'mg' as const,volumeML:3,preparedAt:null,expiresAt:null}]};
    expect(doseContainer(data,protocol,2,'mg','2026-10-23')).toBeNull();
    const info=doseContainer(data,{...protocol,vialId:'v'},2,'mg','2026-10-23');
    expect(info?.calculation?.volumeML).toBe(6);
    expect(info?.insufficient).toBe(true);
    expect(doseContainer(data,{...protocol,vialId:'v'},25,'units','2026-10-23')?.calculation?.volumeML).toBe(.25);
  });
});
