/** A local calendar date, without a timezone or time of day. */
export type Day = string;
export type DoseUnit = 'mg' | 'mcg' | 'iu' | 'units';
export type ScheduleRule =
  | { kind: 'interval'; days: number }
  | { kind: 'weekdays'; days: number[] }
  | { kind: 'cycle'; daysOn: number; daysOff: number };
export interface DosePhase { id: string; durationDays: number | null; amount: number; unit: DoseUnit }
export interface Protocol {
  id: string; peptideId: string; name: string; startDay: Day; endDay: Day | null;
  rule: ScheduleRule; phases: DosePhase[]; reminderMinuteOfDay: number; isActive: boolean;
  /** Optional grouping and explicit container link; absent on existing records. */
  planId?: string; planName?: string; vialId?: string;
}
export interface BlendComponent { name: string; amount: number; unit: DoseUnit }
export interface Peptide { id: string; name: string; color: string; notes: string; components?: BlendComponent[] }
export interface Vial {
  id: string; peptideId: string; kind: 'powder' | 'pen'; amount: number; unit: DoseUnit;
  volumeML: number; preparedAt: Day | null; expiresAt: Day | null;
  /** Optional: clicks a full pen/cartridge gives. Enables a click count per dose. */
  totalClicks?: number;
}
export interface InjectionLog {
  id: string; protocolId: string; day: Day; amount: number; unit: DoseUnit;
  status: 'taken' | 'skipped'; timestamp: string; note: string; vialId?: string;
}
export interface Measurement {
  id: string; day: Day; name: string; value: number | null; unit: string; note: string;
  category: 'body' | 'lab' | 'other'; photo?: string;
}
export interface CycleItem {
  id: string; peptideName: string; color: string; amount: number; unit: DoseUnit;
  rule: ScheduleRule; weeks: number; phases: DosePhase[];
  /** Exact inclusive duration, or open ended. Absent uses legacy `weeks`. */
  durationDays?: number | null;
  /** Calendar-day offset from the template's common start. Absent means zero. */
  startOffsetDays?: number;
  /** User-entered mixture composition, absent on legacy templates. */
  components?: BlendComponent[];
}
export interface SavedCycle { id: string; name: string; items: CycleItem[]; lastStartedAt: string | null }
export interface Settings { language: 'nb' | 'en'; theme: 'electric' | 'corall' }
export interface AppData {
  version: 1; peptides: Peptide[]; protocols: Protocol[]; vials: Vial[]; logs: InjectionLog[];
  measurements: Measurement[]; cycles: SavedCycle[]; settings: Settings;
}
export interface PlannedDose { protocolId: string; day: Day; amount: number; unit: DoseUnit; phaseIndex: number }
export interface PeptideNeed { name: string; totalAmount: number; unit: DoseUnit }
